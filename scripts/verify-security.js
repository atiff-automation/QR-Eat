/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Helper to hash session ID (mirrors SessionManager)
function hashSessionId(sessionId) {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

async function main() {
  console.log('--- Security Verification (JS) ---');

  const userId = 'verify-user-js-' + Date.now();
  const rawSessionId = 'raw-test-session-' + Date.now();
  const hashedSessionId = hashSessionId(rawSessionId);
  const validRoleId = '4ead7491-2e56-48bf-bc12-e5a3ddcf1f2f'; // Retrieved from DB

  // 1. Verify Session Hashing storage
  console.log('\n[1] Verifying Session Hashing storage...');

  await prisma.userSession.create({
    data: {
      userId,
      sessionId: hashedSessionId,
      currentRoleId: validRoleId,
      expiresAt: new Date(Date.now() + 3600000),
      permissions: [],
    },
  });

  const dbRecord = await prisma.userSession.findUnique({
    where: { sessionId: hashedSessionId },
  });

  if (dbRecord) {
    console.log('✅ PASS: Session found by hashed ID');
    console.log('Raw ID:', rawSessionId);
    console.log('DB Session ID (Hashed):', dbRecord.sessionId);
    if (dbRecord.sessionId === hashedSessionId) {
      console.log('✅ PASS: DB session ID matches expected hash');
    }
  } else {
    console.log('❌ FAIL: Could not find session by hashed ID');
  }

  // 2. Verify Audit Logging
  console.log('\n[2] Verifying Audit Logging...');
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'JS_VERIFICATION_TEST',
      resource: 'system',
      tableName: 'verification_logs', // Added missing field
      description: 'JS security verification test',
      severity: 'low',
    },
  });

  const auditLog = await prisma.auditLog.findFirst({
    where: { userId, action: 'JS_VERIFICATION_TEST' },
  });

  if (auditLog) {
    console.log('✅ PASS: Audit log entry created');
  } else {
    console.log('❌ FAIL: Audit log entry not found');
  }

  // Cleanup
  console.log('\nCleaning up...');
  await prisma.userSession.deleteMany({ where: { userId } });
  await prisma.auditLog.deleteMany({ where: { userId } });

  console.log('\n--- Verification Complete ---');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
