# AURA — Project Info & Change Log

Brief reference for the project's major features and a running log of major
implementations. Add a new entry under **Change Log** after every major change.

## Overview

AURA is an **ESP32 health-monitoring device** paired with a **multi-role web
platform**. The device reads vital signs and streams them over MQTT to a NestJS
API, which persists them and pushes them to a real-time Next.js dashboard.
Accounts are split into **patients**, **doctors**, and **individual users**.

## Component map

| Area | Path | Stack |
|---|---|---|
| Firmware | `main/` | ESP-IDF, C, FreeRTOS |
| Protocol contract | `PROTOCOL.md`, `web-platform/packages/protocol/` | TypeScript types + guards |
| API | `web-platform/apps/api/` | NestJS 11, Prisma, PostgreSQL, Socket.IO |
| Web dashboard | `web-platform/apps/web/` | Next.js 16, React 19 |
| Infrastructure | `web-platform/docker-compose.yml` | Mosquitto (MQTT), Postgres 16 |

## Major features

- **Live vitals** — heart rate, SpO₂, temperature; validated on arrival and persisted per account type.
- **ECG streaming** — 250 Hz in 50-sample chunks with `START_ECG` / `STOP_ECG` session lifecycle.
- **Device life-cycle** — provisioning (server-issued UUID + credentials) and pairing (code → account).
- **Real-time dashboard** — Socket.IO vitals, live ECG trace, device status, command ACKs, device events.
- **Clinical & wellness workflows** — doctor–patient relationships, prescriptions, appointments with Stream video tokens, individual-user device pairing.
- **AI Health Companion** — Gemini-powered chatbot scoped to health questions (individual users).
- **On-device UI** — SH1106/SSD1306 OLED showing vitals, temperature, color, and live ECG via buttons.

### Hardware / sensors

| Sensor | Measures |
|---|---|
| AD8232 | ECG waveform (GPIO36) |
| MAX30102 | heart rate, SpO₂ |
| MLX90614 | non-contact body temperature |
| TCS34725 | ambient color |
| SH1106 OLED | local display (I²C `0x3C`) |

## Change Log

### 2026-09-11 - Pulse Link dashboard, history, ECG, and sensor updates
Renamed the visible web brand from AURA to Pulse Link. Added date-based vital
history, min/max/average summaries, ECG session history with waveform viewing,
historical AI context for stored readings, and clearer paired/online device
status in the dashboard.

Added the hemoglobin estimate workflow. The web card accepts age and gender and
keeps Red/IR values read-only; the firmware now publishes raw MAX30102 Red/IR
samples through MQTT live events for the model request. Rebuild and flash the
firmware before using this flow. The estimate remains research-only and is not a
diagnosis.

Sensor commands now stop conflicting I2C sensor streams before starting another
mode. Added deterministic seven-day demo vital and ECG seeding for
2026-09-03 through 2026-09-09, plus `start-pulse-link.bat` for Docker, MQTT,
Prisma, API, and web startup.

### 2026-09-10 — OLED partial refresh (uncommitted)
Firmware: OLED driver now composes into a framebuffer with dirty-page tracking and
flushes once (`oled_flush` / `oled_flush_dirty`). Local UI redraws only the numeric
value region on refresh instead of blanking and repainting the whole display, so
the screen no longer flickers.

### 2026-09-09 — PulseLink landing, login, rebrand, AI retry
Added PulseLink landing, dedicated login, rebranding, and AI overload retry handling.

### 2026-09-07 — Network access & CORS
Allowed external device access via `next.config.ts` (`allowedDevOrigins`), enabling
the dashboard over the LAN (`192.168.1.37`).

### 2026-09-06 — AI Health Companion
Added the Gemini-powered health chatbot (floating UI, multilingual, health-context,
persistence) with backend `POST /ai/chat` + `GET /ai/health-context` endpoints.

### 2026-09-06 — Documentation & design
Consolidated Markdown files into `docs/` and added `docs/DESIGN.md`.

### 2026-09-06 — Provisioning, page transitions, deployment guides
Added ESP32 provisioning/pair scripts, MQTT broker config, `framer-motion` page
transitions, and flashing/deployment guides.

### 2026-09-06 — Multi-role platform
Delivered the core platform: real ECG, video consultations, and the individual-user portal.

### 2026-09-05 — Initial project
First ESP32 health-device firmware and web-platform scaffold.
