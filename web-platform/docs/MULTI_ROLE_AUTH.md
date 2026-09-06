# Multi-Role Authentication System

## Overview

The authentication system now supports **multi-role accounts** - one email can have multiple roles (Patient, Doctor, Individual User). Users select their role at login time.

---

## How It Works

### Registration Flow

1. **First Registration**: User picks a role (e.g., "Personal")
   - Creates `User` record with email + password
   - Creates `IndividualUser` record linked to that User

2. **Add Another Role**: Same email, same password, different role
   - Checks password matches
   - Adds the new role (e.g., creates `Patient` record)
   - Does NOT create duplicate `User` record

### Login Flow

1. User enters email + password
2. **User selects role** (Patient, Doctor, or Personal)
3. Backend verifies:
   - Email/password is correct
   - User has access to that role
4. JWT contains the **selected role**, not a fixed "default" role

---

## Database Structure

```
User
├── email: "user@example.com"
├── passwordHash: "..."
├── role: PATIENT (default/primary, but JWT uses selected role)
├── Patient (optional)
├── Doctor (optional)
└── IndividualUser (optional)
```

**One user can have all three role records!**

---

## Example Scenarios

### Scenario 1: Start as Personal User

```
1. Register: user@example.com + password + "Personal"
   → Creates User + IndividualUser

2. Login: user@example.com + password + "Personal"
   → Goes to /user/dashboard ✅
```

### Scenario 2: Add Patient Role

```
3. Register: user@example.com + password + "Patient"
   → Verifies password matches
   → Creates Patient record (same User)

4. Login: user@example.com + password + "Patient"
   → Goes to /clinic/patient/dashboard ✅

5. Login: user@example.com + password + "Personal"
   → Still goes to /user/dashboard ✅
```

### Scenario 3: Add Doctor Role

```
6. Register: user@example.com + password + "Doctor"
   → Creates Doctor record

7. Login: user@example.com + password + "Doctor"
   → Goes to /clinic/doctor/dashboard ✅
```

Now `user@example.com` can login as:
- ✅ Patient → `/clinic/patient/dashboard`
- ✅ Doctor → `/clinic/doctor/dashboard`
- ✅ Personal → `/user/dashboard`

---

## API Changes

### POST /api/auth/register

**Body**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "role": "INDIVIDUAL_USER"
}
```

**Response** (New User):
```json
{
  "access_token": "eyJhbG...",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "role": "INDIVIDUAL_USER",
    "individualUserId": "..."
  }
}
```

**Response** (Adding Role to Existing User):
```json
{
  "access_token": "eyJhbG...",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "role": "PATIENT",
    "patientId": "...",
    "individualUserId": "..." // Still has Individual User
  }
}
```

**Errors**:
- `401 Unauthorized`: Password doesn't match existing account
- `409 Conflict`: User already has this role

---

### POST /api/auth/login

**Body** (NEW - now requires `role`):
```json
{
  "email": "user@example.com",
  "password": "password123",
  "role": "PATIENT"
}
```

**Response**:
```json
{
  "access_token": "eyJhbG...",
  "user": {
    "id": "...",
    "email": "user@example.com",
    "role": "PATIENT", // Selected role
    "patientId": "...",
    "doctorId": null,
    "individualUserId": "..."
  }
}
```

**Errors**:
- `401 Unauthorized`: Wrong email/password
- `401 Unauthorized`: User doesn't have access to this role

---

## Frontend Changes

### Login Screen

User flow:
1. Select role (Patient / Doctor / Personal)
2. Enter email + password
3. Click "Access Platform"

The selected role is sent to the API.

### Auth Provider

```typescript
// OLD
await login(email, password);

// NEW
await login(email, password, role);
```

### Routing

After successful login, user is redirected based on **selected role**:

```typescript
if (user.role === "INDIVIDUAL_USER") {
  router.replace("/user/dashboard");
} else if (user.role === "PATIENT") {
  router.replace("/clinic/patient/dashboard");
} else if (user.role === "DOCTOR") {
  router.replace("/clinic/doctor/dashboard");
}
```

---

## Security Considerations

### JWT Token

The JWT contains the **selected role**, not all available roles:

```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "role": "PATIENT"  // Only the active role
}
```

If the user wants to switch roles, they must **log out and log back in** with a different role.

### Route Protection

Middleware checks the JWT role:

```typescript
// /user/* routes require role = "INDIVIDUAL_USER"
// /clinic/patient/* routes require role = "PATIENT"
// /clinic/doctor/* routes require role = "DOCTOR"
```

Users cannot access routes they're not logged in as, even if they have that role available.

---

## Migration from Old System

### Existing Users

Users registered **before** this change have:
- One role only (e.g., `PATIENT`)
- No other role records

**They can add roles** by "registering" again:
1. Visit login screen
2. Click "New" tab
3. Select different role
4. Enter **same email + same password**
5. New role is added

---

## Testing

### Test Case 1: Multi-Role User

```bash
# Create as Personal
POST /api/auth/register
{
  "email": "test@example.com",
  "password": "password123",
  "role": "INDIVIDUAL_USER"
}

# Add Patient role
POST /api/auth/register
{
  "email": "test@example.com",
  "password": "password123",
  "role": "PATIENT"
}

# Login as Patient
POST /api/auth/login
{
  "email": "test@example.com",
  "password": "password123",
  "role": "PATIENT"
}
→ Redirects to /clinic/patient/dashboard ✅

# Login as Personal
POST /api/auth/login
{
  "email": "test@example.com",
  "password": "password123",
  "role": "INDIVIDUAL_USER"
}
→ Redirects to /user/dashboard ✅
```

### Test Case 2: Wrong Role

```bash
# Login as Doctor (but user doesn't have Doctor role)
POST /api/auth/login
{
  "email": "test@example.com",
  "password": "password123",
  "role": "DOCTOR"
}
→ 401 Unauthorized: "You don't have access as DOCTOR" ❌
```

---

## Benefits

✅ **Flexibility**: One email for personal wellness AND clinical care  
✅ **Separation**: Data stays separate (personal vs clinical)  
✅ **Simple UX**: User picks their context at login  
✅ **Secure**: JWT only contains active role  
✅ **Backwards Compatible**: Old users can add new roles  

---

## User Experience

### For Regular Users

"I use `me@example.com` for everything. When I login:
- Pick **Personal** → Track my wellness
- Pick **Patient** → See my doctor appointments
- Same email, different experiences!"

### For Healthcare Professionals

"I'm a doctor AND a patient at another clinic:
- Login as **Doctor** → See my patients
- Login as **Patient** → See MY doctors
- Clear separation of my two roles!"

---

**The system now supports true multi-role functionality!** 🎉
