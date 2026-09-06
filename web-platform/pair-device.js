// Pair ESP32 device with user account
const { PrismaClient } = require('@prisma/client');

async function pairDevice() {
  const prisma = new PrismaClient();

  try {
    console.log('🔗 Pairing device AC1518D43F30 with try.ritabrata@gmail.com...');

    // Pair with try.ritabrata@gmail.com (c6f917b6-3187-4cb1-87fd-ffb40133e060)
    const pairing = await prisma.individualUserDevice.create({
      data: {
        individualUserId: 'c6f917b6-3187-4cb1-87fd-ffb40133e060',
        deviceId: '6655f128-7fa5-42c1-b8b0-43a487ad3635', // Device UUID from provisioning
      },
    });

    console.log('✅ Device paired successfully!', pairing);

    // Verify the pairing
    const deviceStatus = await prisma.device.findUnique({
      where: { id: '6655f128-7fa5-42c1-b8b0-43a487ad3635' },
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

    console.log('\n📊 Final Device Status:');
    console.log('   Device ID:', deviceStatus?.id);
    console.log('   Hardware ID:', deviceStatus?.hardwareId);
    console.log('   Pairing Code:', deviceStatus?.pairingCode);
    console.log('   Paired with:', deviceStatus?.individualUserLinks?.[0]?.individualUser?.user?.email);
    console.log('   ✅ READY TO RECEIVE DATA FROM ESP32!');

    console.log('\n🌐 Next Steps:');
    console.log('   1. Flash your ESP32 with updated MQTT broker IP (10.38.218.232)');
    console.log('   2. ESP32 will connect and start sending data');
    console.log('   3. View data at http://localhost:3000/user/dashboard');
    console.log('   4. Check devices at http://localhost:3000/user/devices');

  } catch (error) {
    if (error.code === 'P2002') {
      console.log('⚠️  Device already paired with this user');
    } else {
      console.error('❌ Error pairing device:', error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

pairDevice();