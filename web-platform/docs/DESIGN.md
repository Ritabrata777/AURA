# AURA Platform - System Design Document

## 🎯 Overview

AURA is a real-time health monitoring platform that connects ESP32-based medical devices to a web-based dashboard for continuous health tracking. The system supports multiple user roles (patients, doctors, and individual wellness users) with real-time data streaming and historical analysis.

## 📐 System Architecture

### High-Level Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   ESP32 Device  │ MQTT    │  NestJS API      │  HTTP   │   Next.js Web   │
│   (Health Mon.) ├────────→│  + MQTT Broker   │←────────┤   Dashboard     │
│                 │         │  + PostgreSQL    │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
        │                            │                             │
        │                            │                             │
        ├─ AD8232 (ECG)             ├─ WebSocket (Socket.io)     ├─ React 19
        ├─ MAX30102 (SpO2, HR)      ├─ Real-time ingestion       ├─ TypeScript
        └─ MLX90614 (Temperature)   └─ Data persistence          └─ Tailwind CSS
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AURA PLATFORM                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐     │
│  │  Hardware Layer │   │  Backend Layer  │   │  Frontend Layer │     │
│  ├─────────────────┤   ├─────────────────┤   ├─────────────────┤     │
│  │                 │   │                 │   │                 │     │
│  │ • ESP32-DevKit  │   │ • NestJS API    │   │ • Next.js 16    │     │
│  │ • AD8232 ECG    │   │ • MQTT Broker   │   │ • React 19      │     │
│  │ • MAX30102      │   │ • PostgreSQL    │   │ • Framer Motion │     │
│  │ • MLX90614      │   │ • Socket.io     │   │ • Recharts      │     │
│  │ • SSD1306 OLED  │   │ • Prisma ORM    │   │ • Tailwind v3   │     │
│  │                 │   │ • JWT Auth      │   │ • Socket.io     │     │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## 🏗️ Technical Stack

### Hardware (ESP32 Firmware)
- **Platform**: ESP-IDF (Espressif IoT Development Framework)
- **Microcontroller**: ESP32-WROOM-32
- **Sensors**:
  - AD8232: Single-lead ECG sensor (250 Hz sampling rate)
  - MAX30102: Pulse oximeter & heart rate sensor
  - MLX90614: Non-contact infrared temperature sensor
- **Display**: SSD1306 128x64 OLED display
- **Communication**: WiFi (2.4GHz), MQTT protocol

### Backend (NestJS API)
- **Framework**: NestJS (Node.js framework)
- **Language**: TypeScript 5.8
- **Database**: PostgreSQL (via Neon serverless)
- **ORM**: Prisma 6.x
- **Real-time**: Socket.io (WebSocket)
- **Message Broker**: MQTT (Eclipse Mosquitto)
- **Authentication**: JWT + Passport
- **Password Hashing**: bcrypt

### Frontend (Next.js Web)
- **Framework**: Next.js 16.3 (App Router)
- **Runtime**: React 19
- **Language**: TypeScript 5.8
- **Styling**: Tailwind CSS v3
- **Animations**: Framer Motion 13.2
- **Charts**: Recharts 3.10
- **Icons**: Lucide React
- **Video**: Stream.io Video SDK (for consultations)

### Infrastructure
- **Development**: Docker Compose (PostgreSQL + MQTT)
- **Database**: Neon (PostgreSQL serverless)
- **MQTT Broker**: Eclipse Mosquitto
- **Deployment**: 
  - Frontend: Vercel
  - Backend: Render
  - Database: Neon

## 🔌 Communication Protocol

### MQTT Topics Structure

```
devices/{deviceId}/status          # Device health status (retained)
devices/{deviceId}/measurements    # Spot readings (HR, SpO2, temp)
devices/{deviceId}/ecg             # ECG waveform chunks (250 Hz)
devices/{deviceId}/events          # Operational events & errors
devices/{deviceId}/acks            # Command acknowledgments
devices/{deviceId}/commands        # Commands TO device (subscribed)
```

### Message Format

All messages follow a standard envelope format:

```typescript
{
  "messageId": "uuid-v4",
  "deviceId": "hardware-id-or-uuid",
  "type": "STATUS | MEASUREMENT | ECG_DATA | EVENT | COMMAND_ACK",
  "timestamp": "ISO-8601-datetime",
  "payload": { /* type-specific data */ }
}
```

### Data Flow

```
┌──────────────┐                                    ┌──────────────┐
│   ESP32      │                                    │   Browser    │
│   Device     │                                    │   Client     │
└──────┬───────┘                                    └──────┬───────┘
       │                                                   │
       │ 1. Publish sensor data                           │
       │    (MQTT QoS 1)                                  │
       ├─────────────────────────────┐                    │
       │                             │                    │
       │                             ▼                    │
       │                      ┌────────────┐              │
       │                      │   MQTT     │              │
       │                      │   Broker   │              │
       │                      └──────┬─────┘              │
       │                             │                    │
       │                             │ 2. Ingest          │
       │                             ▼                    │
       │                      ┌────────────┐              │
       │                      │  NestJS    │              │
       │                      │  Ingestion │              │
       │                      │  Service   │              │
       │                      └──────┬─────┘              │
       │                             │                    │
       │            3. Store         │   4. Broadcast     │
       │              ┌──────────────┼────────────────┐   │
       │              ▼              │                ▼   │
       │       ┌────────────┐        │         ┌─────────────┐
       │       │ PostgreSQL │        │         │  Socket.io  │
       │       │  Database  │        │         │  WebSocket  │
       │       └────────────┘        │         └─────┬───────┘
       │                             │               │
       │                             │               │ 5. Real-time
       │                             │               │    push
       │                             │               ▼
       │                             │         ┌──────────────┐
       │ 7. Command                  │         │   Browser    │
       │    response                 │ 6. API  │   Client     │
       │◄────────────────────────────┼─────────│  Dashboard   │
       │                             │         └──────────────┘
       │                             │
```

## 💾 Database Schema

### User & Authentication
```prisma
User (id, email, passwordHash, role)
  ├─→ Patient (1:1)
  ├─→ Doctor (1:1)
  └─→ IndividualUser (1:1)

Patient ─→ PatientDevice ←─ Device
Doctor ─→ DoctorPatient ←─ Patient
IndividualUser ─→ IndividualUserDevice ←─ Device
```

### Device & Measurements
```prisma
Device (id, hardwareId, pairingCode)
  ├─→ Measurement (patientId, type, value, quality)
  ├─→ IndividualMeasurement (individualUserId, type, value)
  ├─→ EcgSession (patientId, sampleRate, startedAt)
  │     └─→ EcgChunk (sequence, samples[])
  └─→ IndividualEcgSession (individualUserId, sampleRate)
        └─→ IndividualEcgChunk (sequence, samples[])
```

### Key Design Decisions

**1. Dual Measurement Tables**
- Separate tables for clinic patients vs individual users
- Allows different access patterns and privacy controls
- Individual users: full ownership, no doctor relationships
- Clinic patients: shared access with authorized doctors

**2. Hardware ID vs Device ID**
- `hardwareId`: ESP32 MAC address (immutable, used on MQTT)
- `id`: Database UUID (mutable, used in API)
- Separation allows device replacement without data loss

**3. ECG Storage Strategy**
- Chunked storage (50 samples per chunk @ 250 Hz)
- Reduces write latency, enables partial streaming
- Session management with start/end timestamps

## 🔐 Security Architecture

### Authentication Flow

```
┌─────────────┐
│   User      │
│   Login     │
└──────┬──────┘
       │ 1. POST /api/auth/login
       │    { email, password }
       ▼
┌─────────────┐
│  Auth       │
│  Service    │ 2. Verify password (bcrypt)
└──────┬──────┘
       │ 3. Generate JWT token
       │    { userId, role }
       ▼
┌─────────────┐
│  Client     │ 4. Store token
│  Storage    │    (memory + auth context)
└──────┬──────┘
       │ 5. All requests include
       │    Authorization: Bearer <token>
       ▼
┌─────────────┐
│  Protected  │ 6. JWT Guard validates
│  Routes     │    Passport strategy
└─────────────┘
```

### Multi-Role Authorization

```typescript
Roles:
  PATIENT       → View own data, pair devices
  DOCTOR        → View assigned patients, prescribe
  INDIVIDUAL_USER → View own data, full control
  ADMIN         → System administration (future)

One email → Multiple roles (User table is shared)
Role selection happens at login time
```

### Device Security

- **Pairing**: Devices use pairing codes (MED-XXXXXX)
- **MQTT**: Currently no TLS (development only)
- **Production**: Should use:
  - MQTT over TLS (port 8883)
  - Client certificates
  - Credential rotation

## 🎨 Frontend Architecture

### App Router Structure

```
app/
├── (auth)/
│   └── page.tsx                    # Login screen
├── user/                           # Individual user routes
│   ├── layout.tsx                  # Shared layout + nav
│   ├── dashboard/page.tsx
│   ├── vitals/page.tsx
│   ├── ecg/page.tsx
│   ├── trends/page.tsx
│   ├── devices/page.tsx
│   ├── profile/page.tsx
│   └── settings/page.tsx
├── clinic/
│   ├── patient/                    # Patient portal
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   └── ...
│   └── doctor/                     # Doctor portal
│       ├── layout.tsx
│       ├── dashboard/page.tsx
│       ├── patients/page.tsx
│       ├── appointments/page.tsx
│       └── prescriptions/page.tsx
└── layout.tsx                      # Root layout
```

### State Management

```typescript
// Authentication State (React Context)
AuthProvider
  ├─ status: 'loading' | 'authenticated' | 'unauthenticated'
  ├─ user: { id, email, role }
  ├─ token: JWT string
  └─ actions: { login, logout, register }

// Real-time State (Socket.io + React hooks)
useLiveFeed(token, callbacks)
  ├─ onMeasurement: (data) => void
  ├─ onEcgChunk: (chunk) => void
  ├─ onDeviceStatus: (status) => void
  └─ status: 'connecting' | 'ready' | 'error'

// API State (Custom hooks + fetch)
useApi() → api(endpoint, options)
  ├─ Automatic token injection
  ├─ Error handling
  └─ Type-safe responses
```

### Page Transitions

- **Library**: Framer Motion 13.2
- **Strategy**: Layout-level `<PageTransition>` wrapper
- **Animation**: Fade + slide (300ms, cubic-bezier easing)
- **Mode**: "wait" (prevents overlapping transitions)

## 📊 Real-Time Data Pipeline

### ECG Waveform Rendering

```
ESP32 ADC → 250 Hz sampling
     ↓
50-sample chunks (200ms)
     ↓
MQTT publish (QoS 1)
     ↓
NestJS ingestion
     ↓
PostgreSQL storage + WebSocket broadcast
     ↓
React component receives chunk
     ↓
Canvas 2D rendering (rolling buffer)
     ↓
60 FPS animation frame updates
```

### Performance Optimizations

1. **MQTT Routing Cache**
   - 60s TTL for device → patient/user mapping
   - Reduces DB lookups from 5/sec to ~0.02/sec per device

2. **ECG Session Cache**
   - Track known sessions in memory
   - Skip DB lookup for subsequent chunks
   - Max 1000 tracked sessions

3. **WebSocket Rooms**
   - Per-user rooms (patient ID or individual user ID)
   - Only broadcast to subscribed users
   - Automatic room cleanup on disconnect

4. **Frontend Optimizations**
   - Canvas rendering (not DOM elements)
   - RequestAnimationFrame for smooth updates
   - Circular buffer for waveform history
   - Memoization of expensive computations

## 🚀 Deployment Architecture

### Development

```
┌─────────────────────────────────────────────┐
│  Local Machine                               │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Next.js   │  │ NestJS   │  │ Docker   │ │
│  │ :3000     │  │ :3001    │  │ Compose  │ │
│  │           │  │          │  │          │ │
│  │ Dev Mode  │  │ Watch    │  │ Postgres │ │
│  │           │  │ Mode     │  │ + MQTT   │ │
│  └───────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────┘
```

### Production (Recommended)

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Vercel    │         │    Render    │         │    Neon     │
│             │  HTTPS  │              │  SSL    │             │
│  Next.js    │◄────────┤  NestJS API  ├────────→│ PostgreSQL  │
│  Frontend   │         │              │         │  Database   │
│             │         │              │         │             │
│  CDN Edge   │         │  WebSocket   │         │  Serverless │
└─────────────┘         │  + MQTT      │         └─────────────┘
                        └──────────────┘
                              │
                              │ MQTT
                              ▼
                        ┌──────────────┐
                        │  ESP32       │
                        │  Devices     │
                        └──────────────┘
```

**Why Split Frontend/Backend?**

- **Frontend (Vercel)**: Static + serverless, global CDN
- **Backend (Render)**: Persistent process needed for:
  - Long-lived MQTT subscription
  - Persistent WebSocket connections
  - Real-time data ingestion

## 🔄 Key Workflows

### Device Provisioning

```
1. Device boots → Generates pairing code from MAC
2. Admin adds device to database (hardwareId, pairingCode)
3. User enters pairing code in dashboard
4. System creates Device ↔ User link
5. MQTT ingestion service invalidates routing cache
6. Device data now routes to user's dashboard
```

### Live Health Monitoring

```
1. User opens dashboard → WebSocket connects
2. Joins room: patient-{id} or individual-{id}
3. ESP32 publishes measurements → MQTT broker
4. NestJS ingestion:
   a. Parses and validates message
   b. Resolves device → user routing (with cache)
   c. Stores in PostgreSQL
   d. Broadcasts to WebSocket room
5. Browser receives real-time update
6. React components re-render with new data
```

### ECG Recording Session

```
1. User clicks "Start Recording" (with duration)
2. API sends MQTT command → devices/{id}/commands
3. ESP32 receives, starts ADC sampling @ 250 Hz
4. Chunks sent every 200ms (50 samples)
5. Each chunk:
   a. Stored in EcgChunk table
   b. Broadcast via WebSocket
   c. Rendered on canvas in real-time
6. Duration timer expires OR user clicks "Stop"
7. ESP32 sends ECG_SESSION_END message
8. Session marked complete in database
9. Available in history for playback
```

## 🎯 Design Principles

### 1. Real-Time First
- WebSocket for live data, not polling
- Canvas rendering for smooth waveforms
- Optimistic UI updates

### 2. Separation of Concerns
- ESP32: Data collection only
- Backend: Business logic, persistence, routing
- Frontend: Presentation, user interaction

### 3. Type Safety
- TypeScript everywhere (ESP32 is C)
- Shared protocol types (Prisma + TypeScript)
- Runtime validation (class-validator)

### 4. Progressive Enhancement
- Works without WebSocket (polling fallback)
- Graceful degradation on connection loss
- Offline-first device operation

### 5. Multi-Tenancy
- Clinic patients vs individual users
- Row-level security via userId/patientId
- Separate measurement tables for isolation

## 📈 Scalability Considerations

### Current Limitations
- Single MQTT broker (no clustering)
- WebSocket server not horizontally scalable
- All real-time in single Node.js process

### Future Scaling Strategy
1. **MQTT Cluster**: Multiple brokers with shared subscriptions
2. **Redis Pub/Sub**: For WebSocket horizontal scaling
3. **Read Replicas**: For historical data queries
4. **TimescaleDB**: For time-series optimization
5. **Message Queue**: Kafka/RabbitMQ for buffering

## 🔍 Monitoring & Observability

### Metrics to Track
- MQTT message rate (msg/sec per device)
- WebSocket connection count
- API response times (p50, p95, p99)
- Database query performance
- ECG chunk write latency
- Frontend render performance

### Logging Strategy
- Structured logging (JSON format)
- Log levels: ERROR, WARN, INFO, DEBUG
- Correlation IDs for request tracing
- Device ID + User ID in all logs

## 📝 Future Enhancements

### Short Term
- [ ] MQTT over TLS
- [ ] Device firmware OTA updates
- [ ] ECG analysis algorithms (QRS detection)
- [ ] Prescription management improvements
- [ ] Video consultation stability

### Long Term
- [ ] Mobile apps (React Native)
- [ ] AI-powered health insights
- [ ] Integration with external EHR systems
- [ ] Multi-device support per user
- [ ] Advanced analytics and reporting
- [ ] HIPAA compliance certification

---

**Document Version**: 1.0  
**Last Updated**: September 2026  
**Authors**: AURA Development Team
