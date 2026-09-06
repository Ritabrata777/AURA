# Clinic Routes - Implementation Roadmap

This document outlines what needs to be built for `/clinic/patient/*` and `/clinic/doctor/*` routes.

---

## Current State

✅ **Completed**:
- Individual User routes (`/user/*`) - FULLY FUNCTIONAL
- Backend API for clinic features (patients, doctors, prescriptions, video)
- Database models for clinical workflow
- MQTT ingestion for patient devices
- WebSocket real-time updates

🚧 **Not Yet Implemented**:
- Clinic Patient frontend routes
- Doctor frontend routes
- Some UI polish on clinic-specific features

---

## Clinic Patient Routes (`/clinic/patient/*`)

### Required Pages

#### 1. `/clinic/patient/dashboard`
**Purpose**: Patient overview with upcoming appointments, recent vitals, doctor connections

**Components Needed**:
- `AppointmentCard` - Show next appointment with doctor
- `DoctorCard` - List connected doctors
- `VitalCard` - Reuse from `/user` (already built)
- `QuickActions` - "Request Appointment", "View Prescriptions", "Message Doctor"

**API Calls**:
- `GET /api/appointments` - Get upcoming appointments
- `GET /api/doctors/relationships` - List connected doctors
- `GET /api/measurements/summary` - Current vitals

---

#### 2. `/clinic/patient/doctors`
**Purpose**: Manage doctor relationships

**Features**:
- List all connected doctors (ACCEPTED relationships)
- List pending requests (sent by patient or doctor)
- Search for doctors by email
- Send connection request to doctor
- Accept/reject doctor requests

**Components Needed**:
- `DoctorList` - Grid/list of doctors with status badges
- `DoctorRequestModal` - Form to request connection
- `PendingRequestCard` - Show pending status with actions

**API Calls**:
- `GET /api/doctors/relationships` - All relationships
- `POST /api/doctors/request` - Request doctor connection
- `POST /api/doctors/relationships/:id/respond` - Accept/reject

---

#### 3. `/clinic/patient/appointments`
**Purpose**: View and manage appointments

**Features**:
- List all appointments (past, upcoming, cancelled)
- Filter by status
- Join video call when appointment is active
- View appointment details

**Components Needed**:
- `AppointmentList` - Table or cards
- `AppointmentDetail` - Modal with full info
- `JoinCallButton` - Links to video consultation

**API Calls**:
- `GET /api/appointments` - All appointments
- `GET /api/video/consultations/active` - Check for active call
- `GET /api/video/consultations/:callId/token` - Get video token

---

#### 4. `/clinic/patient/prescriptions`
**Purpose**: View all prescriptions from doctors

**Features**:
- List all prescriptions (active, completed, cancelled)
- View medications for each prescription
- Filter by status
- View prescribing doctor

**Components Needed**:
- `PrescriptionCard` - Shows diagnosis, medications, doctor
- `MedicationList` - Table of drugs with dose, frequency
- `StatusBadge` - Active/Completed/Cancelled indicator

**API Calls**:
- `GET /api/prescriptions` - All prescriptions for patient

---

#### 5. `/clinic/patient/devices`
**Purpose**: Manage medical devices (same as `/user/devices` but clinical context)

**Features**:
- **Reuse components from `/user/devices`**:
  - `DeviceStatus`
  - `EmptyState`
- Pair/unpair devices
- View device history
- Send device commands

**API Calls**:
- `GET /api/devices` - List devices
- `POST /api/devices/pair` - Pair device
- `POST /api/devices/:id/commands` - Send command

---

#### 6. `/clinic/patient/vitals`
**Purpose**: View health measurements (reuse `/user/vitals`)

**Features**:
- **Reuse from `/user/vitals`**:
  - `VitalCard`
  - `TrendChart`
  - Measurement history table

**API Calls**:
- `GET /api/measurements/summary`
- `GET /api/measurements`
- `GET /api/measurements/trends`

---

#### 7. `/clinic/patient/profile`
**Purpose**: View/edit patient profile

**Features**:
- Show patient info (name, DOB, contact)
- Show medical ID
- Edit profile fields
- View account status

**API Calls**:
- `GET /api/patients/profile`
- `PATCH /api/patients/profile` (needs to be created)

---

### Shared Layout

Create `/clinic/patient/layout.tsx`:

```typescript
// Sidebar navigation
const navigation = [
  { name: "Dashboard", href: "/clinic/patient/dashboard", icon: Home },
  { name: "Doctors", href: "/clinic/patient/doctors", icon: Stethoscope },
  { name: "Appointments", href: "/clinic/patient/appointments", icon: Calendar },
  { name: "Prescriptions", href: "/clinic/patient/prescriptions", icon: Pill },
  { name: "Devices", href: "/clinic/patient/devices", icon: Activity },
  { name: "Vitals", href: "/clinic/patient/vitals", icon: Heart },
  { name: "Profile", href: "/clinic/patient/profile", icon: User },
];
```

---

## Doctor Routes (`/clinic/doctor/*`)

### Required Pages

#### 1. `/clinic/doctor/dashboard`
**Purpose**: Doctor overview with today's appointments, patient alerts, quick stats

**Components Needed**:
- `TodaySchedule` - List of appointments
- `PatientAlertCard` - Abnormal vitals from patients
- `StatsCard` - Total patients, appointments this week, etc.
- `QuickActions` - "View Patients", "Create Prescription", "Schedule Appointment"

**API Calls**:
- `GET /api/appointments?date=today` - Today's schedule
- `GET /api/patients` - Patient list with stats
- Custom endpoint for alerts (needs to be created)

---

#### 2. `/clinic/doctor/patients`
**Purpose**: List and search all patients

**Features**:
- Grid/list of all patients (ACCEPTED relationships)
- Search by name or email
- Quick view of latest vitals
- Click to view patient detail

**Components Needed**:
- `PatientCard` - Shows name, latest vital, device status
- `PatientSearchBar` - Filter/search
- `EmptyState` - No patients yet

**API Calls**:
- `GET /api/patients/relationships` - All doctor-patient relationships
- `GET /api/patients` - Patient list

---

#### 3. `/clinic/doctor/patients/:patientId`
**Purpose**: Detailed patient view

**Features**:
- Patient info summary
- Current vitals (real-time)
- Measurement history
- ECG sessions
- Prescription history
- Appointment history
- Actions: "Create Prescription", "Schedule Appointment", "Start Video Call"

**Components Needed**:
- `PatientHeader` - Name, contact, DOB
- `VitalSummary` - Reuse `VitalCard`
- `MeasurementTimeline` - Historical data
- `EcgViewer` - View ECG sessions
- `PrescriptionHistory` - List past prescriptions
- `ActionButtons` - Quick actions

**API Calls**:
- `GET /api/measurements/patients/:patientId/summary`
- `GET /api/measurements/patients/:patientId/measurements`
- `GET /api/measurements/patients/:patientId/trends`
- `GET /api/prescriptions/patients/:patientId`

---

#### 4. `/clinic/doctor/appointments`
**Purpose**: View and manage all appointments

**Features**:
- Calendar view of appointments
- List view with filters
- Create new appointment
- Join active video calls
- Cancel/reschedule

**Components Needed**:
- `AppointmentCalendar` - Month/week view
- `CreateAppointmentModal` - Form to schedule
- `AppointmentList` - Table view

**API Calls**:
- `GET /api/appointments` - All appointments
- `POST /api/appointments` (needs to be created)
- `GET /api/video/consultations/active`

---

#### 5. `/clinic/doctor/prescriptions`
**Purpose**: View all prescriptions, create new ones

**Features**:
- List all prescriptions by status
- Filter by patient
- Create new prescription
- Update prescription status

**Components Needed**:
- `PrescriptionList` - Table/grid
- `CreatePrescriptionModal` - Form with medication builder
- `PrescriptionDetail` - View full prescription

**API Calls**:
- `GET /api/prescriptions` - All prescriptions
- `POST /api/prescriptions` - Create new
- `PATCH /api/prescriptions/:id/status` - Update status

---

#### 6. `/clinic/doctor/profile`
**Purpose**: Doctor profile and settings

**Features**:
- Show doctor info
- Edit specialization, contact info
- View statistics (total patients, consultations)

**API Calls**:
- `GET /api/doctors/profile` (needs to be created)
- `PATCH /api/doctors/profile` (needs to be created)

---

### Shared Layout

Create `/clinic/doctor/layout.tsx`:

```typescript
const navigation = [
  { name: "Dashboard", href: "/clinic/doctor/dashboard", icon: Home },
  { name: "Patients", href: "/clinic/doctor/patients", icon: Users },
  { name: "Appointments", href: "/clinic/doctor/appointments", icon: Calendar },
  { name: "Prescriptions", href: "/clinic/doctor/prescriptions", icon: Pill },
  { name: "Profile", href: "/clinic/doctor/profile", icon: User },
];
```

---

## Video Consultation Component

### `/components/VideoCall.tsx`

**Purpose**: Reusable video call component for both patients and doctors

**Features**:
- Uses Stream Video SDK (already configured in backend)
- Camera/mic controls
- Screen sharing
- End call button
- Connection status indicator

**Props**:
```typescript
interface VideoCallProps {
  callId: string;
  token: string;
  role: "patient" | "doctor";
  onEndCall: () => void;
}
```

**API Integration**:
- Token obtained from `GET /api/video/consultations/:callId/token`
- Call created via `POST /api/video/consultations`

---

## Additional Backend Endpoints Needed

Most API endpoints exist, but these may need to be added:

### Appointments
- `POST /api/appointments` - Create appointment
- `PATCH /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id` - Cancel appointment

### Patient Profile
- `PATCH /api/patients/profile` - Update patient info

### Doctor Profile
- `GET /api/doctors/profile` - Get doctor profile
- `PATCH /api/doctors/profile` - Update doctor info

### Alerts/Notifications
- `GET /api/notifications` - Get user notifications
- `POST /api/notifications/:id/read` - Mark as read

---

## Design Theme

### Clinic Patient
- **Color**: Blue/Teal (medical, trust)
- **Style**: Clean, professional, accessible
- **Tone**: Reassuring, clear, patient-friendly

### Doctor
- **Color**: Green/Blue (professional, clinical)
- **Style**: Efficient, data-dense, dashboard-like
- **Tone**: Professional, concise, action-oriented

### Shared Components
Many components can be **reused between roles**:
- `VitalCard`
- `DeviceStatus`
- `TrendChart`
- `LoadingState`
- `EmptyState`

Just adjust:
- Context (personal vs clinical)
- Actions available (patients can't prescribe)
- Data scope (doctors see multiple patients)

---

## Implementation Order

### Phase 1: Clinic Patient Routes
1. Create layout + dashboard
2. Implement doctors page (relationship management)
3. Implement appointments page
4. Implement prescriptions page
5. Reuse devices + vitals from `/user/*`
6. Add profile page

### Phase 2: Doctor Routes
1. Create layout + dashboard
2. Implement patients list
3. Implement patient detail page (most complex)
4. Implement appointments page
5. Implement prescriptions page
6. Add profile page

### Phase 3: Video Integration
1. Create VideoCall component
2. Wire up to appointments
3. Test patient-doctor video flow

### Phase 4: Polish
1. Real-time notifications
2. Alerts for abnormal vitals
3. Advanced filtering
4. Data export
5. Mobile optimization

---

## Estimated Effort

- **Clinic Patient Routes**: ~8-12 hours
- **Doctor Routes**: ~12-16 hours (patient detail page is complex)
- **Video Component**: ~4-6 hours
- **Polish & Testing**: ~6-8 hours

**Total**: ~30-42 hours for complete clinic implementation

---

## Key Differences from Individual User

| Feature | Individual User | Clinic Patient | Doctor |
|---------|----------------|----------------|--------|
| **Purpose** | Personal wellness | Clinical care | Provider workflow |
| **Devices** | Self-paired | Clinic-provided | Monitor multiple |
| **Data** | Own only | Own + doctor access | All patients |
| **Appointments** | ❌ None | ✅ With doctors | ✅ With patients |
| **Prescriptions** | ❌ None | ✅ View only | ✅ Create/manage |
| **Video** | ❌ None | ✅ Join calls | ✅ Host calls |
| **Relationships** | Independent | Linked to doctors | Linked to patients |

---

## Next Steps

1. **Start with Clinic Patient Dashboard**:
   - Create `/clinic/patient/layout.tsx`
   - Create `/clinic/patient/dashboard/page.tsx`
   - Test navigation and auth

2. **Build incrementally**:
   - Add one page at a time
   - Test each feature before moving on
   - Reuse components where possible

3. **Use existing API**:
   - Most endpoints already exist
   - Just need to wire up frontend

4. **Keep it simple first**:
   - MVP features only
   - Polish later
   - Focus on functionality

---

**The foundation is solid. Now it's just UI implementation!** 🚀
