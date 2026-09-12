/**
 * One-off: ensure every NumberSequence row has lastValue >= 100,
 * so the next issued document number is 101+. Existing higher counters
 * are left as-is.
 *
 * Run: node apps/api/prisma/seed-sequence-start.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const KINDS = ["JOB_CARD", "INVOICE", "PURCHASE"];
const START_AT = 100; // next issued = 101

(async () => {
  const shops = await prisma.shop.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true },
  });

  for (const shop of shops) {
    for (const kind of KINDS) {
      await prisma.numberSequence.upsert({
        where: { shopId_kind: { shopId: shop.id, kind } },
        create: { shopId: shop.id, kind, lastValue: START_AT },
        update: {},
      });
      const cur = await prisma.numberSequence.findUnique({
        where: { shopId_kind: { shopId: shop.id, kind } },
        select: { lastValue: true },
      });
      if (cur && cur.lastValue < START_AT) {
        await prisma.numberSequence.update({
          where: { shopId_kind: { shopId: shop.id, kind } },
          data: { lastValue: START_AT },
        });
        console.log(`✓ ${shop.name} / ${kind}: bumped ${cur.lastValue} → ${START_AT}`);
      } else {
        console.log(`= ${shop.name} / ${kind}: kept at ${cur?.lastValue}`);
      }
    }
  }

  await prisma.$disconnect();
})();
