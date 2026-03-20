import { PrismaService } from '../../src/common/prisma.service';

const TABLES = [
  '"UserNotification"',
  '"ReliabilityEvent"',
  '"PaymentWebhookEvent"',
  '"PaymentTransaction"',
  '"ContactUnlockApproval"',
  '"ContactUnlock"',
  '"SwapChainMember"',
  '"SwapChain"',
  '"ListingInterest"',
  '"MatchCandidate"',
  '"SwapListing"',
  '"User"',
];

export async function resetDatabase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE;`,
  );
}
