import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyModels() {
  console.log('Verifying Prisma models...');
  
  // Check if new models exist
  const hasIndividualUser = typeof prisma.individualUser !== 'undefined';
  const hasIndividualMeasurement = typeof prisma.individualMeasurement !== 'undefined';
  const hasIndividualEcgSession = typeof prisma.individualEcgSession !== 'undefined';
  const hasIndividualEcgChunk = typeof prisma.individualEcgChunk !== 'undefined';
  const hasIndividualUserDevice = typeof prisma.individualUserDevice !== 'undefined';
  
  console.log('✓ IndividualUser model:', hasIndividualUser ? 'EXISTS' : 'MISSING');
  console.log('✓ IndividualMeasurement model:', hasIndividualMeasurement ? 'EXISTS' : 'MISSING');
  console.log('✓ IndividualEcgSession model:', hasIndividualEcgSession ? 'EXISTS' : 'MISSING');
  console.log('✓ IndividualEcgChunk model:', hasIndividualEcgChunk ? 'EXISTS' : 'MISSING');
  console.log('✓ IndividualUserDevice model:', hasIndividualUserDevice ? 'EXISTS' : 'MISSING');
  
  if (hasIndividualUser && hasIndividualMeasurement && hasIndividualEcgSession && hasIndividualEcgChunk && hasIndividualUserDevice) {
    console.log('\n✅ All Individual User models are available!');
    console.log('\nThe TypeScript errors in your IDE are false positives.');
    console.log('Solution: Restart TypeScript Server in VS Code:');
    console.log('  1. Press Ctrl+Shift+P');
    console.log('  2. Type "TypeScript: Restart TS Server"');
    console.log('  3. Press Enter');
    process.exit(0);
  } else {
    console.log('\n❌ Some models are missing. Run: npm run prisma:generate -w @health-platform/api');
    process.exit(1);
  }
}

verifyModels().catch(console.error).finally(() => prisma.$disconnect());
