# ESP32 Health Monitoring Device

An ESP32 board reads a person's vital signs and streams them over MQTT to a web
dashboard in near real time. Three kinds of accounts exist: **patients**, whose
readings doctors can see only after the patient grants access; **doctors**, who
manage those relationships, prescriptions, and video consultations; and
**individual users**, personal-wellness accounts that own devices outright with
no clinical workflow attached.

> **Engineering prototype.** This is not a clinically validated diagnostic device.
> Do not use it to make medical decisions. MQTT runs unauthenticated and
> unencrypted in this configuration, which is fine on a lab network and unsuitable
> for real patient data.

## What works

- Live vitals ingestion — heart rate, SpO₂, temperature — validated on arrival and persisted per user type
- ECG streaming at 250 Hz in 50-sample chunks, with server-side session lifecycle (`START_ECG` / `STOP_ECG`)
- Device provisioning (server-issued UUID + credentials) and pairing (pairing code → account)
- Near-real-time dashboard over Socket.IO: vitals, live ECG trace, device status, command ACKs, device events
- Doctor–patient relationships (request / accept / reject / revoke), prescriptions, appointments with Stream video tokens
- Audit logging of device events and command acknowledgements

Not yet working: see [Known limitations](#known-limitations).

## Hardware

| Sensor | Interface | Measures |
|---|---|---|
| AD8232 | ADC1 channel 0, **GPIO36** | ECG waveform at 250 Hz |
| MAX30102 | I²C `0x57` | heart rate, SpO₂ |
| MLX90614 | I²C `0x5A` | body temperature (non-contact) |
| SSD1306 OLED | I²C `0x3C` | *stubbed — see Known limitations* |

Wiring: the I²C bus is `I2C_NUM_0` on **SDA GPIO21 / SCL GPIO22** at 400 kHz,
shared by all I²C devices. The status LED is **GPIO2**. Two buttons are wired to
**GPIO33** (up) and **GPIO32** (select).

## Architecture

```
ESP32 firmware  ──MQTT──▶  Mosquitto  ──MQTT──▶  NestJS API  ──▶  PostgreSQL
                                                      │
                                                      └──socket.io──▶  Next.js dashboard
ESP32 firmware  ◀──MQTT──  Mosquitto  ◀──MQTT──  NestJS API  ◀──HTTP──  Next.js dashboard
```

The browser never speaks MQTT. It speaks HTTP and WebSocket to the API, and the
API is the only component that touches both the broker and the database.

Two identity namespaces matter and must not be conflated:

- **`hardwareId`** — the ESP32's chip MAC, baked in at boot, twelve uppercase hex
  characters. The firmware publishes and subscribes under this name because it is
  all the device knows about itself.
- **`Device.id`** — a UUID minted by the API during provisioning. Database rows,
  REST routes, and WebSocket events all key on it.

The API translates between the two on every message; commands are published to
the *hardware* topic and their payloads rewritten to match.

```
esp32-health-device/            ← repository root
├── main/                       ESP-IDF firmware (C, FreeRTOS)
├── PROTOCOL.md                 firmware ↔ platform message contract
├── sdkconfig                   effective firmware build config (see Configuration)
└── web-platform/               npm workspaces monorepo
    ├── docker-compose.yml      Postgres 16 + Mosquitto 2
    ├── packages/protocol/      shared TypeScript types + runtime type guards
    └── apps/
        ├── api/                NestJS 11 — ingestion, auth, REST, WebSocket
        │   └── prisma/         schema + migrations (Prisma ORM)
        └── web/                Next.js 16 / React 19 dashboard
```

### API surface

| Module | Responsibility |
|---|---|
| `auth` | register / login, JWT |
| `devices` | provision, pair, status, send command, unpair |
| `doctors` | doctor–patient relationship lifecycle |
| `measurements` | vitals + ECG session history (own and, for doctors, their patients') |
| `prescriptions` | create / list / change status |
| `video` | Stream consultation rooms and participant tokens |
| `individual-users` | device pairing and readings for wellness accounts |
| `mqtt` | device ingestion + command publishing |
| `websocket` | Socket.IO rooms, one per user |

Inbound device traffic arrives on `devices/{hardwareId}/{status,measurements,ecg,events,acks}`
and outbound commands on `devices/{hardwareId}/commands`. Every inbound payload is
validated against the shared protocol package before persistence or broadcast —
see [`PROTOCOL.md`](PROTOCOL.md) for the full envelope, payload shapes, and
command set. The API publishes these Socket.IO events to the owner's room:
`device:status`, `measurement:new`, `ecg:chunk`, `ecg:session-end`,
`command:ack`, `device:event`.

---

## Prerequisites

Node.js 22+, Docker Desktop, and ESP-IDF with an ESP32 — plain `esp32`, not
S2/S3/C3. The vendored components require IDF 5.3 or newer, and `dependencies.lock`
was last resolved against **6.1.0**; building on an older toolchain will re-resolve
the lockfile.

## Running the platform

```bash
cd web-platform

docker compose up -d                          # Postgres + Mosquitto
npm install
npm run build -w @health-platform/protocol    # required before either app starts
npm run prisma:migrate -w @health-platform/api

npm run dev:api                               # http://localhost:3001
npm run dev:web                               # http://localhost:3000
```

Neither `npm install` nor the protocol build is optional, even on a checkout that
worked before. `socket.io-client` is a recent addition, so a stale `node_modules`
will fail to resolve it. And `@health-platform/protocol` resolves through
`dist/index.js`, which is gitignored — until it has been compiled once, both apps
fail with a missing-module error that looks unrelated to the protocol package.

The web app opens on a login screen and routes by role: individual users to
`/user/*` (dashboard, vitals, trends, devices), patients and doctors to their
dashboards. Clinic-style `/clinic/*` routes are a roadmap in
[`web-platform/CLINIC_ROUTES_TODO.md`](web-platform/CLINIC_ROUTES_TODO.md).
A walkthrough for exercising the individual-user flow end to end is in
[`web-platform/TESTING_GUIDE.md`](web-platform/TESTING_GUIDE.md).

## Running the firmware

```bash
idf.py set-target esp32
idf.py menuconfig     # Health Device Configuration: Wi-Fi SSID/password and MQTT broker URI
idf.py flash monitor
```

The broker URI must be the LAN IP of the machine running Docker, reachable from
the ESP32's Wi-Fi network. `localhost` will never work — on the device, that
resolves to the device itself.

### Getting a device onto the platform

1. **Provision** — from the web/API, `POST /devices/provision` with the
   `x-provisioning-token` header. Returns the device's UUID and pairing code.
2. **Boot** — the firmware publishes status every five seconds under its
   `hardwareId`; the API matches it to the provisioned row.
3. **Pair** — `POST /devices/pair` (or the equivalent in the dashboard) with the
   pairing code, from a patient or individual-user account.

## Configuration

Firmware settings live in `menuconfig` and are written to **`sdkconfig`**, which is
checked into the repository. `sdkconfig` overrides the defaults in
`main/app_config.h` and `main/Kconfig`, so reading those headers will tell you the
wrong broker address. Always check `sdkconfig` for the effective value.

The API reads these environment variables; most entries in
`apps/api/.env.example` beyond these are aspirational and unused.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | token signing — **required in production** |
| `DEVICE_PROVISIONING_TOKEN` | `x-provisioning-token` header for device provisioning; **required in production** |
| `NODE_ENV` | gates the two production start-up guards above |
| `MQTT_URL` | broker URL, defaults to `mqtt://localhost:1883` |
| `FRONTEND_URL` | additional allowed CORS origin |
| `PORT` | API port, defaults to 3001 |
| `GETSTREAM_API_KEY` / `GETSTREAM_API_SECRET` | video consultation tokens |

The web app reads `NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:3001`.

## Common tasks

```bash
npm run build          # protocol, then API and web
npm run typecheck      # protocol build + tsc --noEmit across workspaces
npm run dev:api        # API in watch mode
npm run dev:web        # Next.js dev server
```

`npm test` currently just runs the typechecks — see Known limitations.

---

## Troubleshooting

**A device shows "Offline · last seen never".** That string means no status
message has ever reached the API, so the problem is upstream of the database.
Check the broker address in `sdkconfig` first. Confirm the broker is running with
`docker compose ps`. Watch `idf.py monitor` for Wi-Fi association and MQTT
connection — note that the LED blinks on a 1-second timer regardless of network
state, so a blinking LED tells you nothing. Then confirm the device's `hardwareId`
in the database exactly matches what the firmware prints at boot: twelve uppercase
hex characters, no colons.

Subscribing to `devices/#` with any MQTT client is the fastest way to separate a
device problem from an API problem. A healthy device publishes status every five
seconds.

**Commands appear to send but nothing happens.** The API reports success once the
broker accepts the publish, which is not the same as the device receiving it.
Check the device's ack on `devices/<hardwareId>/acks`.

**Readings never appear after pairing.** The ingestion service caches device
routing for up to a minute; a just-paired device's data is dropped until the
cache expires or the pairing flow explicitly invalidates it. Wait a minute
before assuming the pairing failed.

## Known limitations

**Committed credentials.** Two sets of live credentials are in the repository and
should be rotated: `web-platform/apps/api/.env.example` contains a populated
Neon PostgreSQL connection string with its password, and `sdkconfig` contains a
plaintext Wi-Fi SSID and password. `sdkconfig` is a reasonable `.gitignore`
candidate for that reason.

**No automated tests.** The `test` scripts run `tsc --noEmit`, so verification is
type-level only; nothing has been exercised against real hardware in CI.

**The onboard UI does nothing.** The SSD1306 display module is fully stubbed —
every draw call is a no-op, with the dashboard intended as the display surface —
and although the button driver polls GPIO correctly, its callback is never
registered, so button presses reach nothing. The device depends entirely on the
network.

**The protocol contract lives in four places.** `PROTOCOL.md`,
`web-platform/PROTOCOL.md`, `packages/protocol/src/index.ts`, and
`main/protocol_types.h` duplicate the message contract with nothing enforcing
agreement between them, and they have already drifted: the Markdown documents are
missing a command and two message types the code implements. Treat
`packages/protocol/src/index.ts` as authoritative and update the others by hand.

## Further reading

- [`PROTOCOL.md`](PROTOCOL.md) — MQTT topics, message envelope, command set. Read it before changing anything that crosses the wire.
- [`web-platform/TESTING_GUIDE.md`](web-platform/TESTING_GUIDE.md) — end-to-end walkthrough of the individual-user flow.
- [`web-platform/CLINIC_ROUTES_TODO.md`](web-platform/CLINIC_ROUTES_TODO.md) — planned `/clinic/*` patient and doctor routes.
- [`web-platform/IMPLEMENTATION_SUMMARY.md`](web-platform/IMPLEMENTATION_SUMMARY.md) — the original feature inventory.
