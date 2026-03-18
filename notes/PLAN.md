# Plan: KAOS "nanomatter" — Custom Matter Controller + React UI

## Context

You have two Philips Smart LED lamps already managed by Home Assistant via the Matter protocol. The goal is to build your own Matter controller from scratch to directly control Matter devices — bypassing HA for the control path — and expose a simple React UI at `matter.kaoshome.dev`. This is a learning project: learn Matter, build a real controller, ship it on the Pi like every other KAOS service.

The project starts with lamps (OnOff, LevelControl, ColorControl clusters) but is designed to grow: smart plugs, motion sensors, irrigation controllers, blinds, and other Matter-compatible devices can be added over time without renaming or restructuring.

**Tech stack chosen:**
- Controller: TypeScript + [matter.js](https://github.com/project-chip/matter.js) (production-ready, full Matter spec implementation)
- Frontend: React (Vite)
- Deployment: Docker on Raspberry Pi, behind Traefik, accessible via Tailscale

---

## Running log: `matter/NOTES.md`

A single file in the repo — `NOTES.md` — acts as a living progress journal throughout the project. It is the raw material for future blog posts.

**What goes in it (updated as work progresses):**
- Matter concepts discovered and understood (in your own words)
- Key decisions made and why
- Resources used (links + one-line summary of what each taught you)
- Gotchas, surprises, things that didn't work and why
- Commissioning steps taken (with actual pairing codes redacted)
- Config snippets worth preserving
- Open questions while learning

**Structure (sections, not strict format):**
```
# KAOS Matter — Progress Notes

## Matter concepts
## Commissioning walkthrough
## Controller implementation notes
## Resources
## Open questions / future blog angles
```

Claude will help update this file after each working session — summarizing what was learned, what was built, and flagging anything worth expanding into a blog post.

---

## Phase 0: Learn Matter (before writing any code)

Study these concepts in order. You need this foundation before any implementation makes sense.

### 0.1 Core concepts (read first)
- **Node**: A physical device on the Matter network (your lamp is a node)
- **Endpoint**: A virtual sub-device inside a node (endpoint 0 = root, endpoint 1 = the actual lamp)
- **Cluster**: A group of related attributes/commands on an endpoint. The ones you care about:
  - `OnOff` — turn the lamp on and off
  - `LevelControl` — brightness
  - `ColorControl` — hue, saturation, color temperature
- **Fabric**: A secure administrative domain. Each controller (HA, your app) is its own fabric. Devices support up to 5 fabrics simultaneously — your lamps can be on HA's fabric AND yours at the same time.
- **Commissioning**: The process of adding a device to a fabric. Uses PASE (passcode exchange) + certificate installation.
- **Multi-admin commissioning**: Opening a new commissioning window on an already-commissioned device so a second controller can add it to a new fabric. This is how you'll add your devices without a factory reset.

### 0.2 Resources to read
1. [Matter primer — Google Home Developers](https://developers.home.google.com/matter/primer/device-data-model) — best intro to the data model
2. [matter.js README and examples](https://github.com/project-chip/matter.js/tree/main/packages/examples) — focus on the `controller` example
3. [matter.js Controller API docs](https://project-chip.github.io/matter.js/) — reference during implementation
4. CSA overview (optional depth): [Silicon Labs Matter fundamentals](https://docs.silabs.com/matter/latest/matter-fundamentals-introduction/)

### 0.3 Key thing to understand about commissioning your devices
Your lamps are already commissioned to HA's fabric. To add them to your controller's fabric:
1. In HA's UI → Developer Tools → call the `matter.open_commissioning_window` service for each device → HA opens a pairing window and gives you a temporary pairing code
2. Your matter.js controller uses that code to commission the device to its own fabric
3. HA still controls them — they're on two fabrics now

---

## Phase 1: Project structure

```
matter/
├── controller/               # TypeScript backend
│   ├── src/
│   │   ├── index.ts          # Express server + startup
│   │   ├── matter-client.ts  # matter.js controller setup
│   │   ├── device-service.ts # discover, commission, command devices
│   │   └── routes.ts         # REST API
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── frontend/                 # React + Vite
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── DeviceCard.tsx
│   │   │   └── ColorPicker.tsx
│   │   └── api.ts            # HTTP client
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── docker-compose.yaml
└── README.md
```

Traefik config lives in the existing `kaos/traefik/dynamic/matter.yml` (following the established pattern).

---

## Phase 2: Controller implementation

### 2.1 Setup matter.js controller
- Initialize a `MatterServer` with `CommissioningController` role
- Store fabric/node data in a persistent file (`matter-store/`) mounted as a Docker volume
- On startup: connect to all previously commissioned nodes

### 2.2 Device service API (REST, served by Express)
```
GET  /api/devices              → list all commissioned devices + current state
GET  /api/devices/:id          → single device state
POST /api/devices/:id/on       → turn on
POST /api/devices/:id/off      → turn off
POST /api/devices/:id/toggle   → toggle
POST /api/devices/:id/brightness  → body: { level: 0-254 }
POST /api/devices/:id/color    → body: { hue: 0-254, saturation: 0-254 }
POST /api/devices/commission   → body: { pairingCode: "..." } → commission a new device
```

### 2.3 Docker networking (important)
Matter uses mDNS multicast for device discovery. Docker bridge networks block multicast by default.
The controller container must use `network_mode: host` (or a macvlan network) to perform mDNS discovery on the LAN.
**This is a known requirement when running matter.js in Docker.**

---

## Phase 3: Frontend implementation

Simple React UI (Vite):
- Device list rendered as cards
- Each card adapts to device type (lamp: on/off toggle + brightness + color picker; plug: on/off toggle; etc.)
- Polls `/api/devices` every 5 seconds for state (no WebSocket needed for v1)
- Served by Nginx in its own container

---

## Phase 4: Traefik + deployment

### 4.1 Traefik dynamic config
New file: `kaos/traefik/dynamic/matter.yml`
- `matter.kaoshome.dev` → frontend container (port 80)
- `matter.kaoshome.dev/api` → controller container (port 3000)
- Same TLS pattern as lista: `certResolver: le`, `websecure` entrypoint

### 4.2 Docker Compose
Two services:
- `matter-frontend`: Nginx serving React build, on `traefik` network
- `matter-controller`: Node.js/TypeScript, `network_mode: host` for mDNS, also on `traefik` network

Note: `network_mode: host` and named networks can't coexist in Docker. Workaround: expose controller on a fixed host port (e.g., 3001) and have Traefik route to `http://192.168.178.39:3001` (the Pi's LAN IP) instead of a container name.

### 4.3 CI/CD
Follow the same GitHub Actions pattern as lista:
- Build arm64 image with `FROM --platform=$BUILDPLATFORM` for builder stages
- Push to GHCR
- Deploy via Tailscale GitHub Action (OIDC)

---

## Implementation order

1. [x] Create `NOTES.md` with initial structure
2. [x] Create `PLAN.md`
3. [ ] Read all Phase 0 resources — log key concepts and resources in NOTES.md
4. [ ] Run the matter.js controller example locally to understand the API — log discoveries
5. [ ] Open commissioning window on one lamp via HA and commission it via the matter.js CLI example — verify you can read its state and toggle it — log the exact steps taken
6. [ ] Build the controller TypeScript service (matter-client + device-service + REST routes)
7. [ ] Test controller locally on the Pi (not in Docker yet) to avoid mDNS issues during development
8. [ ] Build the React frontend
9. [ ] Dockerize both, wire up Traefik config
10. [ ] Set up CI/CD pipeline
11. [ ] Review NOTES.md and identify blog post angles (could be 1 post or a mini-series)

---

## Verification

- `https://nanomatter.kaoshome.dev` loads the React UI showing all commissioned devices
- Toggling a lamp in the UI physically turns it on/off
- HA still controls the same devices independently (multi-fabric proof)
- `GET /api/devices` returns live state reflecting actual device status
