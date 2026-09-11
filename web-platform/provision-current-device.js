const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const device = await prisma.device.upsert({
    where: { hardwareId: "ECE334149CAC" },
    update: {
      pairingCode: "MED-149CAC",
      lastSeenAt: new Date(),
    },
    create: {
      hardwareId: "ECE334149CAC",
      pairingCode: "MED-149CAC",
      credentialHash: "dev-credential",
      lastSeenAt: new Date(),
    },
  });

  console.log("Device provisioned:");
  console.log(`Hardware ID: ${device.hardwareId}`);
  console.log(`Pairing code: ${device.pairingCode}`);
  console.log(`Database ID: ${device.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
