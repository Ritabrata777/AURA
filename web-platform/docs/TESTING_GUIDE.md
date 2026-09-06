# Testing Guide - Individual User Experience

## Prerequisites

Both servers should be running:
- **API**: http://localhost:3001
- **Web**: http://localhost:3000

## Test Flow

### 1. Register as Individual User

1. Open http://localhost:3000
2. Click the **"Personal"** role button (purple)
3. Click **"New"** tab
4. Enter:
   - Email: `test@example.com`
   - Password: `password123` (8+ characters)
5. Click **"Create Account"**

✅ **Expected**: You should be automatically redirected to `/user/dashboard`

---

### 2. Dashboard View

**URL**: `/user/dashboard`

**You should see**:
- "No Devices Paired" empty state
- "Pair Device" button

---

### 3. Pair a Device

1. Click **"Pair Device"** button
2. You'll need a real ESP32 device OR create a test device in the database

#### Option A: Create Test Device (Database)

Open a database client and run:

```sql
-- Create a test device
INSERT INTO "Device" ("id", "hardwareId", "pairingCode", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'TEST-MAC-001',
  '123456',
  NOW(),
  NOW()
);
```

#### Option B: Use Real ESP32 Device

Flash the ESP32 firmware and note the pairing code shown on the OLED display.

3. Enter the pairing code: `123456`
4. Click **"Pair"**

✅ **Expected**: Device appears on dashboard, shows as "Offline" (until real device connects)

---

### 4. Navigate Through App

Test each section:

#### Devices (`/user/devices`)
- ✅ See paired device
- ✅ Device shows last seen time
- ✅ Shows pairing code
- ✅ Can pair additional devices

#### Vitals (`/user/vitals`)
- ✅ Shows three vital cards (Heart Rate, SpO2, Temperature)
- ✅ "No data" state until device sends measurements
- ✅ Recent measurements table (empty until data arrives)

#### Trends (`/user/trends`)
- ✅ Can switch between 7/14/30 days
- ✅ "No trend data yet" message
- ✅ Charts will appear once measurements exist

#### Profile (`/user/profile`)
- ✅ Shows email
- ✅ Shows "Individual User" role
- ✅ Shows member since date

#### Settings (`/user/settings`)
- ✅ Notification toggles
- ✅ "Change Password" button
- ✅ "Export My Data" button
- ✅ "Delete Account" button (red)
- ✅ Safety disclaimer visible

---

### 5. Test Real-Time Data (Optional)

If you have an ESP32 device paired:

1. Device should connect to MQTT
2. Navigate to **Vitals** page
3. Device sends measurements every ~5 seconds
4. ✅ Vital cards update in real-time
5. ✅ Measurements appear in table
6. Navigate to **Dashboard**
7. ✅ Device shows as "Online"
8. ✅ Vital cards update there too

---

### 6. Test Route Protection

1. Log out (click "Log Out" in sidebar)
2. Try to visit: http://localhost:3000/user/dashboard directly

✅ **Expected**: Redirected to login page

3. Try logging in as a **Patient** or **Doctor**
4. Try to visit: http://localhost:3000/user/dashboard

✅ **Expected**: Redirected to home (middleware blocks cross-role access)

---

### 7. Test Mobile Responsive

1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Test on iPhone/Android sizes

✅ **Expected**: Layout adapts, sidebar becomes mobile-friendly

---

### 8. Test API Endpoints Directly

#### Get Devices
```bash
curl http://localhost:3001/api/individual-users/devices \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Get Measurements Summary
```bash
curl http://localhost:3001/api/individual-users/measurements/summary \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Pair Device
```bash
curl http://localhost:3001/api/individual-users/devices/pair \
  -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pairingCode": "123456"}'
```

---

## Test Data Separation

Verify individual user data is kept separate from clinic patient data:

1. Register as **Patient** role
2. Pair a device (use different pairing code)
3. Log out
4. Log in as **Individual User**
5. ✅ Should NOT see the patient's device
6. ✅ Should only see individual user's devices

---

## MQTT Testing (Advanced)

### Simulate Device Messages

Use MQTT client (e.g., MQTT Explorer, mosquitto_pub):

#### 1. Publish Status Message
```json
Topic: devices/TEST-MAC-001/status

{
  "type": "status",
  "deviceId": "TEST-MAC-001",
  "timestamp": 1736110000000,
  "firmwareVersion": "1.0.0",
  "wifiConnected": true,
  "mqttConnected": true,
  "timeSynced": true,
  "freeHeap": 100000,
  "uptimeSeconds": 3600
}
```

#### 2. Publish Measurement
```json
Topic: devices/TEST-MAC-001/measurements

{
  "type": "measurement",
  "deviceId": "TEST-MAC-001",
  "timestamp": 1736110000000,
  "measurementType": "HEART_RATE",
  "value": 72,
  "unit": "bpm",
  "quality": "VALID"
}
```

✅ **Expected**: 
- Vitals page updates immediately
- New measurement appears in database
- WebSocket emits to individual user's room

---

## Common Issues

### Issue: "No devices paired" but I paired one
**Solution**: Check database that `IndividualUserDevice` record exists with correct `individualUserId`

### Issue: Measurements not appearing
**Solution**: 
1. Check device is actually paired (not just provisioned)
2. Verify MQTT messages use correct `deviceId` (hardware ID)
3. Check API logs for MQTT ingestion errors

### Issue: "Port already in use"
**Solution**: 
```bash
# Kill old Next.js process
taskkill /F /IM node.exe
# Or specific PID
taskkill /PID <PID> /F
```

### Issue: Device shows offline
**Solution**:
- Device needs to publish status message every ~30s
- Check MQTT broker is running: `docker compose up -d`
- Verify device connects to correct MQTT URL

### Issue: Middleware redirects not working
**Solution**:
- Check cookies are being set after login
- Open DevTools > Application > Cookies
- Should see: `auth_token` and `user_role`

---

## Database Queries for Testing

### Check Individual User
```sql
SELECT * FROM "IndividualUser" WHERE "userId" = '<user-id>';
```

### Check Paired Devices
```sql
SELECT * FROM "IndividualUserDevice" WHERE "individualUserId" = '<individual-user-id>';
```

### Check Measurements
```sql
SELECT * FROM "IndividualMeasurement" 
WHERE "individualUserId" = '<individual-user-id>'
ORDER BY "measuredAt" DESC
LIMIT 10;
```

### Check ECG Sessions
```sql
SELECT * FROM "IndividualEcgSession" 
WHERE "individualUserId" = '<individual-user-id>';
```

---

## Success Criteria

✅ Can register as Individual User  
✅ Can login as Individual User  
✅ Can pair device with 6-digit code  
✅ Dashboard shows paired devices  
✅ Vitals page shows measurement cards  
✅ Trends page shows charts (when data exists)  
✅ Profile page shows user info  
✅ Settings page functional  
✅ Route protection works  
✅ Logout clears session  
✅ Cannot access as different role  
✅ Real-time updates work (if device connected)  
✅ Mobile responsive  
✅ Safety disclaimers visible  

---

**Ready to Test!** Start with the registration flow and work through each section.
