// Device provisioning script for ESP32 AC1518D43F30
// Run with: node provision-device.js

const { PrismaClient } = require('@prisma/client');

async function provisionDevice() {
  const prisma = new PrismaClient();

  try {
    console.log('🔧 Provisioning ESP32 device AC1518D43F30...');

    // 1. Create or update device record
    const device = await prisma.device.upsert({
      where: { hardwareId: 'AC1518D43F30' },
      update: {
        pairingCode: 'MED-D43F30',
        lastSeenAt: new Date(),
      },
      create: {
        id: 'AC1518D43F30',
        hardwareId: 'AC1518D43F30',
        pairingCode: 'MED-D43F30',
        credentialHash: 'dev-credential-hash',
      },
    });

    console.log('✅ Device provisioned:', device);

    // 2. Find individual users to pair with
    const users = await prisma.individualUser.findMany({
      select: { 
        id: true, 
        userId: true,
        user: {
          select: {
            email: true
          }
        }
      },
      take: 5,
    });

    console.log('\n📱 Available individual users to pair with:');
    users.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.user.email} (${user.id})`);
    });

    if (users.length > 0) {
      console.log('\n💡 To pair device with a user, run this in the database:');
      console.log('   INSERT INTO "IndividualUserDevice" ("individualUserId", "deviceId", "pairedAt")');
      console.log('   VALUES (\'USER_ID_HERE\', \'AC1518D43F30\', NOW());');
      console.log('\n   Or use the web interface to pair the device.');
    }

    // 3. Show current device status
    const deviceWithLinks = await prisma.device.findUnique({
      where: { id: 'AC1518D43F30' },
      include: {
        individualUserLinks: {
          include: {
            individualUser: {
              include: {
                user: {
                  select: { email: true }
                }
              }
            }
          }
        }
      }
    });

    console.log('\n📊 Device status:');
    console.log('   Device ID:', deviceWithLinks?.id);
    console.log('   Hardware ID:', deviceWithLinks?.hardwareId);
    console.log('   Pairing Code:', deviceWithLinks?.pairingCode);
    console.log('   Last Seen:', deviceWithLinks?.lastSeenAt || 'Never');
    
    if (deviceWithLinks?.individualUserLinks?.length) {
      console.log('   Paired with:', deviceWithLinks.individualUserLinks[0].individualUser.user.email);
      console.log('   ✅ READY TO RECEIVE DATA');
    } else {
      console.log('   Paired with: No user (device data will be ignored)');
      console.log('   ⚠️  PAIR THE DEVICE TO START RECEIVING DATA');
    }

    console.log('\n🔌 ESP32 Configuration:');
    console.log('   MQTT Topics:');
    console.log('     - Status: devices/AC1518D43F30/status');
    console.log('     - Measurements: devices/AC1518D43F30/measurements');
    console.log('     - ECG: devices/AC1518D43F30/ecg');

  } catch (error) {
    console.error('❌ Error provisioning device:', error);
  } finally {
    await prisma.$disconnect();
  }
}

provisionDevice();