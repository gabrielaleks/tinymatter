# KAOS nanomatter — Progress Notes

Living journal for the matter project. Raw material for future blog posts.

---

## Matter concepts

### Core data model
- **Node**: A physical device on the Matter network (e.g., one lamp = one node)
- **Endpoint**: A virtual sub-device inside a node. Endpoint 0 is the root (mandatory on every device, holds utility clusters). Endpoint 1+ are the actual functional devices (e.g., the lamp itself).
- **Cluster**: A group of related attributes, events, and commands on an endpoint. Two roles: Server (stateful, holds data) and Client (initiates interactions). Key clusters for lamps:
  - `OnOff` — turn on/off
  - `LevelControl` — brightness (0–254)
  - `ColorControl` — hue, saturation, color temperature
- **Attribute**: Current state or config on a cluster (e.g., `OnOff.onOff` = true/false)
- **Command**: Remote procedure call to invoke behavior (e.g., `OnOff.toggle`)
- **Fabric**: A secure administrative domain with a unique 64-bit Fabric ID and shared root of trust. Each controller (Home Assistant, your app) lives on its own fabric. Matter devices support up to 5 fabrics simultaneously — a lamp can be on HA's fabric AND your custom controller's fabric at the same time.
- **Commissioning**: The process of securely adding a device to a fabric. Involves PASE (Passcode-Authenticated Session Establishment using SPAKE2+), certificate exchange, and installation of a Node Operational Certificate (NOC).
- **Multi-admin commissioning**: Opening a new commissioning window on an already-commissioned device so a second controller can add it to a new fabric — without factory reset.

### Protocol transport
- Matter runs over IP (Wi-Fi, Thread, Ethernet)
- Device discovery uses **mDNS/DNS-SD** (operational discovery for already-networked devices)
- This has implications for Docker: mDNS multicast doesn't cross Docker bridge network boundaries. The controller container needs `network_mode: host` to discover devices on the LAN.

---

## Commissioning walkthrough

_To be filled in as devices are commissioned to the custom fabric._

### Steps to commission a device already managed by Home Assistant
1. HA UI → Developer Tools → Services → call `matter.open_commissioning_window`
   - Target: one of the existing device entities
   - HA opens a temporary pairing window and returns a pairing code
2. Use the matter.js controller (or CLI example) to commission the device using that code
3. Verify: device now belongs to two fabrics (HA's + yours)
4. HA continues to control the device independently

---

## Controller implementation notes

_To be filled in during implementation._

### Key decisions
- Language: TypeScript using matter.js (production-ready, full Matter spec)
- Architecture: Express REST API wrapping matter.js CommissioningController
- Persistence: matter-js node/fabric store in a mounted volume (`matter-store/`)
- Docker networking: `network_mode: host` on the controller container for mDNS
- Traefik workaround: since `host` network mode can't coexist with named Docker networks, Traefik routes to the Pi's LAN IP (`192.168.178.39:3001`) directly instead of a container name

### API surface (initial — lamps focused, will expand with device types)
```
GET  /api/devices                   list all commissioned devices + state
GET  /api/devices/:id               single device state
POST /api/devices/:id/on            turn on
POST /api/devices/:id/off           turn off
POST /api/devices/:id/toggle        toggle
POST /api/devices/:id/brightness    body: { level: 0-254 }
POST /api/devices/:id/color         body: { hue: 0-254, saturation: 0-254 }
POST /api/devices/commission        body: { pairingCode: "..." }
```

---

## Resources

| Resource | What it covers |
|---|---|
| [Matter primer — Google Home Developers](https://developers.home.google.com/matter/primer/device-data-model) | Best intro to nodes, endpoints, clusters, attributes, commands |
| [matter.js examples](https://github.com/project-chip/matter.js/tree/main/packages/examples) | Focus on the `controller` example — closest to what we're building |
| [matter.js API docs](https://project-chip.github.io/matter.js/) | Reference during implementation |
| [Silicon Labs Matter fundamentals](https://docs.silabs.com/matter/latest/matter-fundamentals-introduction/) | Deeper protocol-level detail (optional) |
| [matter.js Controller blog post](https://tomasmcguinness.com/2025/07/20/creating-a-matter-controller-with-matter-js/) | Walkthrough of building a controller with matter.js |

---

## Getting the lamps onto Matter

When I started this project I had been controlling my WiZ lamps through Home Assistant's WiZ integration without thinking much about it. I assumed "WiZ lamps with a Matter logo on the box" meant I was already using Matter — but I wasn't. HA's WiZ integration talks to the lamps over WiZ's own proprietary protocol, a UDP-based local/cloud system that has nothing to do with Matter. Matter is a completely separate, open standard for smart home interoperability. The two protocols are different in both design and purpose:

- **WiZ protocol** — proprietary, cloud-assisted, UDP-based. Owned by Signify (Philips). Works out of the box with the WiZ app and HA's WiZ integration.
- **Matter** — open standard, IP-based (Wi-Fi, Thread, Ethernet), fully local. Devices are commissioned into a cryptographic fabric and communicate directly with controllers over the local network, no cloud required.

The good news is that WiZ lamps run both stacks simultaneously and independently on the same firmware. They're Matter-certified — the box includes a QR code specifically for Matter commissioning — while also supporting the WiZ protocol in parallel. This means I can control the lamps via Matter with my custom controller and they'll continue to work with HA's WiZ integration and the WiZ app at the same time, all staying in sync because they're all talking to the same physical device.

### Commissioning the lamps via Matter

To use a lamp with Matter, it first needs to be commissioned into a Matter fabric. The QR code printed inside the box is the Matter commissioning code — it's used exactly once for first-time pairing. I factory reset a lamp (to clear any previous Matter state) and then scanned the QR code with my phone using **Apple Home**, which became the first fabric admin for that lamp.

### Adding HA to the fabric via multi-admin

With the lamp now in Apple Home's fabric, the next step was adding Home Assistant as a second controller using multi-admin commissioning. I generated a one-time pairing code from Apple Home and gave it to HA's Matter integration, which joined the same fabric without requiring another factory reset.

However, since I run HA as a plain Docker container (not HA OS or Supervised), the add-on store isn't available. HA's Matter integration requires a separate **Matter Server** process to do the heavy lifting — normally installed as an add-on, but in my case I had to run it as its own container.

I added a `matter-server` service to HA's `docker-compose.yaml`:

```yaml
matter-server:
  container_name: matter-server
  image: ghcr.io/home-assistant-libs/python-matter-server:stable
  restart: unless-stopped
  security_opt:
    - apparmor:unconfined
  volumes:
    - ./matter-data:/data
    - /run/dbus:/run/dbus:ro
  network_mode: host
```

It uses `network_mode: host` because Matter relies on mDNS multicast for device discovery, and mDNS multicast traffic doesn't cross Docker bridge network boundaries — host networking is the straightforward fix for this.

This introduced a second problem: because `matter-server` is on the host network and HA is on the `traefik` bridge network, `localhost` inside the HA container resolves to the container itself, not the host machine. So the pre-filled WebSocket URL (`ws://localhost:5580/ws`) that HA suggests for the Matter integration doesn't work. The fix is to add `extra_hosts` to the HA service so it can resolve the host machine via a stable hostname:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

With that in place, the Matter integration URL becomes `ws://host.docker.internal:5580/ws` and the connection succeeds.

---

## Open questions / future blog angles

- How does multi-fabric commissioning work in practice? What happens when two controllers send conflicting commands?
- Does matter.js subscribe to attribute changes (push) or does it poll?
- How is the mDNS discovery issue handled in production — is `host` network mode the standard approach, or is there a cleaner solution?
- Blog angle: "Building a Matter controller from scratch — what HA hides from you"
- Blog angle: "Multi-fabric: why your smart device can serve two masters"
- Future device types: smart plugs, motion sensors, irrigation controllers, blinds
