# Health Platform API

NestJS backend for the ESP32 Health Monitoring Platform.

## Overview

The API boundary owns:
- Authentication and RBAC (JWT-based)
- Device pairing and provisioning
- MQTT message ingestion and validation
- PostgreSQL persistence via Prisma
- WebSocket broadcasting to authorized clients
- Audit logging
- GetStream token generation for video consultations

**Security principle:** Browsers never connect directly to MQTT or receive device credentials. All health data flows through validated server-side APIs.

## Quick Start

### 1. Start Infrastructure

```bash
cd web-platform
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Mosquitto MQTT broker on ports 1883 (TCP) and 9001 (WebSocket)

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Initialize Database

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. Start Development Server

```bash
npm run start:dev
```

API will be available at `http://localhost:3001`

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user (patient or doctor) |
| POST | `/auth/login` | Login and get JWT token |

### Devices

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/devices/provision` | - | Provision a new device |
| POST | `/devices/pair` | Patient | Pair device to patient |
| GET | `/devices` | Patient | Get patient's devices |
| GET | `/devices/:deviceId` | Auth | Get device status |
| DELETE | `/devices/:deviceId` | Patient | Unpair device |

### Measurements

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/measurements` | Patient | Get patient measurements |
| GET | `/measurements/latest` | Patient | Get latest HR, SpO2, temperature |
| GET | `/measurements/ecg-sessions` | Patient | Get ECG sessions |
| GET | `/measurements/ecg-sessions/:sessionId` | Patient | Get ECG session with chunks |

### Doctor-Patient Relationships

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/doctors/patients` | Doctor | Get doctor's patients |
| GET | `/doctors/patients/pending` | Doctor | Get pending requests |
| POST | `/doctors/patients/:patientId/request` | Doctor | Request relationship |
| POST | `/doctors/patients/:patientId/respond` | Doctor | Accept/reject request |
| DELETE | `/doctors/patients/:patientId` | Doctor | Revoke relationship |
| GET | `/doctors/my-doctors` | Patient | Get patient's doctors |

### Video Consultations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/video/consultations` | Doctor | Create consultation |
| GET | `/video/consultations/active` | Auth | Get active consultation |
| GET | `/video/consultations/:callId/token` | Auth | Get GetStream token |

## WebSocket Events

Connect to `/live` namespace on the same port as the API.

### Authentication

```javascript
socket.emit("auth", { token: "jwt-token" });
// Response: auth:success or auth:error
```

### Patient Room Events (received by authorized clients)

| Event | Payload | Description |
|-------|---------|-------------|
| `measurement:new` | `{ type, value, unit, quality, measuredAt }` | New measurement |
| `ecg:chunk` | `{ sessionId, sequence, sampleRate, samples, timestamp }` | ECG data chunk |
| `device:status` | Device status object | Device heartbeat |
| `command:ack` | `{ commandId, command, status, errorCode }` | Command acknowledgment |

## Architecture

```
┌─────────────┐     MQTT      ┌─────────────┐
│   ESP32     │ ────────────> │  MQTT Broker │
│  Device     │  (TLS)        │  (Mosquitto) │
└─────────────┘               └──────┬──────┘
                                     │ MQTT
                                     ▼
                              ┌─────────────┐
                              │   NestJS    │
                              │    API      │
                              │             │
                              │ ┌─────────┐ │
                              │ │ Prisma  │ │
                              │ │  ORM    │ │
                              │ └────┬────┘ │
                              │      │      │
                              │      ▼      │
                              │ ┌─────────┐ │
                              │ │PostgreSQL│ │
                              │ └─────────┘ │
                              │             │
                              │ ┌─────────┐ │
                              │ │WebSocket│ │
                              │ │ Gateway │ │
                              │ └────┬────┘ │
                              └──────┼──────┘
                                     │ WS
                                     ▼
                              ┌─────────────┐
                              │   Next.js   │
                              │   Frontend  │
                              └─────────────┘
```

## Protocol

The firmware and backend communicate via a shared protocol defined in `packages/protocol`.

Key protocol rules:
1. All messages include `protocolVersion` field
2. Devices authenticate independently of pairing codes
3. ECG data is sent in chunks, not individual samples
4. Unknown command types are rejected with `INVALID_COMMAND`
5. Health data is sensitive - APIs enforce patient ownership and doctor authorization

See `PROTOCOL.md` for detailed message schemas.

## Database Schema

Key models:
- `User` - Authentication with role (PATIENT/DOCTOR/ADMIN)
- `Patient` / `Doctor` - Role-specific profiles
- `Device` - Hardware identity and pairing
- `PatientDevice` - Many-to-many pairing relationship
- `DoctorPatient` - Relationship with state (PENDING/ACCEPTED/REJECTED/REVOKED)
- `Measurement` - Point-in-time vitals (HR, SpO2, temperature)
- `EcgSession` / `EcgChunk` - ECG waveform data
- `Appointment` - Video consultations with GetStream call ID
- `AuditLog` - Security-relevant access records

## Security Notes

- Change `JWT_SECRET` in production
- Enable MQTT TLS (`mqtts://`) for production
- Use strong passwords for database
- Configure CORS for production frontend URL
- GetStream credentials required for video consultations
- Never expose database, MQTT, or GetStream secrets in frontend code
- Audit logging tracks all health data access

## Scripts

| Script | Description |
|--------|-------------|
| `npm run start:dev` | Start development server with watch |
| `npm run build` | Build for production |
| `npm run test` | Run tests |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run database migrations |
