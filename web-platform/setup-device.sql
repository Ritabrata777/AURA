-- Setup script for ESP32 device AC1518D43F30
-- Run this in your PostgreSQL database to provision the device

-- 1. Insert the device record
INSERT INTO "Device" (
    id, 
    "hardwareId", 
    "pairingCode", 
    "credentialHash", 
    "createdAt"
) VALUES (
    'AC1518D43F30',           -- Using hardware ID as device ID for development
    'AC1518D43F30',           -- Your ESP32's MAC address
    'MED-D43F30',             -- Pairing code from ESP32
    'dev-credential-hash',    -- Development credential hash
    NOW()
) ON CONFLICT ("hardwareId") DO NOTHING;

-- 2. Check if you have an individual user account
-- Replace 'your@email.com' with your actual email address
-- SELECT id, email FROM "IndividualUser" WHERE email = 'your@email.com';

-- 3. Pair the device with your individual user account
-- UNCOMMENT and update the line below with your actual user ID:
-- INSERT INTO "IndividualUserDevice" ("individualUserId", "deviceId", "pairedAt")
-- VALUES (
--     'YOUR_USER_ID_HERE',    -- Replace with your actual user ID
--     'AC1518D43F30',         -- Your device ID
--     NOW()
-- ) ON CONFLICT ("individualUserId", "deviceId") DO NOTHING;

-- 4. Verify the setup
SELECT 
    d.id as device_id,
    d."hardwareId",
    d."pairingCode",
    d."lastSeenAt",
    iud."individualUserId",
    iu.email as owner_email
FROM "Device" d
LEFT JOIN "IndividualUserDevice" iud ON d.id = iud."deviceId"
LEFT JOIN "IndividualUser" iu ON iud."individualUserId" = iu.id
WHERE d."hardwareId" = 'AC1518D43F30';