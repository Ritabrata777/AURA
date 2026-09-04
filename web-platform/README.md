# Health Monitoring Web Platform

This is the separate web-platform repository boundary for the ESP32 health-monitoring prototype.

Planned applications:

- `apps/api`: NestJS API, MQTT ingestion, WebSocket gateway, authentication, authorization, Prisma.
- `apps/web`: Next.js patient and doctor interfaces.
- `packages/protocol`: versioned TypeScript schemas shared by API and web clients.

The first vertical slice is intentionally protocol-first. Do not add MQTT payloads without updating `PROTOCOL.md` in both repositories.

## Local prerequisites

- Node.js 22+
- Docker Desktop
- PostgreSQL and an MQTT broker for local integration
- GetStream credentials only in server-side environment variables

This repository is an engineering prototype for health monitoring and is not a clinically validated diagnostic device.
