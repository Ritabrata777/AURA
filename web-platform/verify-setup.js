// Verify ESP32 device setup
const { PrismaClient } = require('@prisma/client');

async function verifySetup() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Verifying ESP32 device setup...\n');

    // Check device record
    const device = await prisma.device.findUnique({
      where: { hardwareId: 'AC1518D43F30' },
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

    if (!device) {
      console.log('❌ Device not found in database');
      return;
    }

    console.log('📱 ESP32 Device Status:');
    console.log('   Device ID:', device.id);
    console.log('   Hardware ID:', device.hardwareId);
    console.log('   Pairing Code:', device.pairingCode);
    console.log('   Last Seen:', device.lastSeenAt || 'Never');
    console.log('   Created:', device.createdAt);

    if (device.individualUserLinks?.length > 0) {
      const userEmail = device.individualUserLinks[0].individualUser.user.email;
      console.log('   Paired with:', userEmail);
      console.log('   ✅ DEVICE IS READY TO SEND DATA');
    } else {
      console.log('   Paired with: No user');
      console.log('   ❌ DEVICE NEEDS TO BE PAIRED');
    }

    console.log('\n🔌 MQTT Configuration:');
    console.log('   Broker: 10.38.218.232:1883');
    console.log('   Topics:');
    console.log('     - Status: devices/AC1518D43F30/status');
    console.log('     - Measurements: devices/AC1518D43F30/measurements');
    console.log('     - ECG: devices/AC1518D43F30/ecg');
    console.log('     - Events: devices/AC1518D43F30/events');
    console.log('     - Commands: devices/AC1518D43F30/commands (ESP32 subscribes)');

    console.log('\n📊 What ESP32 Will Send:');
    console.log('   • Heart Rate (every ~2 seconds)');
    console.log('   • SpO2 (every ~2 seconds)');  
    console.log('   • Temperature (continuous)');
    console.log('   • ECG Data (250Hz when recording)');
    console.log('   • Device Status (every 5 seconds)');

    console.log('\n🌐 Where to View Data:');
    console.log('   • Dashboard: http://localhost:3000/user/dashboard');
    console.log('   • Devices: http://localhost:3000/user/devices');
    console.log('   • Vitals: http://localhost:3000/user/vitals');
    console.log('   • ECG: http://localhost:3000/user/ecg');

    console.log('\n🚀 Next Steps:');
    console.log('   1. Flash ESP32 with updated firmware (MQTT IP: 10.38.218.232)');
    console.log('   2. Power on ESP32 and watch serial monitor');
    console.log('   3. Should see "MQTT connected" message');
    console.log('   4. Data will appear in AURA dashboard immediately');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifySetup();