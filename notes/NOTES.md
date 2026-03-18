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

## Open questions / future blog angles

- How does multi-fabric commissioning work in practice? What happens when two controllers send conflicting commands?
- Does matter.js subscribe to attribute changes (push) or does it poll?
- How is the mDNS discovery issue handled in production — is `host` network mode the standard approach, or is there a cleaner solution?
- Blog angle: "Building a Matter controller from scratch — what HA hides from you"
- Blog angle: "Multi-fabric: why your smart device can serve two masters"
- Future device types: smart plugs, motion sensors, irrigation controllers, blinds
