/**
 * One-off: set sellingPrice = round(costPrice * 1.30) for every active Part.
 * Run: node apps/api/prisma/set-selling-price.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const parts = await prisma.part.findMany({
    where: { isDeleted: false },
    select: { id: true, sku: true, name: true, costPrice: true, sellingPrice: true },
  });

  let updated = 0;
  for (const p of parts) {
    const cost = Number(p.costPrice ?? 0);
    if (cost <= 0) continue;
    const newSale = Math.round(cost * 1.30);
    if (newSale === p.sellingPrice) continue;
    await prisma.part.update({
      where: { id: p.id },
      data: { sellingPrice: newSale },
    });
    updated++;
    console.log(`✓ ${p.sku.padEnd(14)} ${p.name.slice(0, 30).padEnd(30)} cost=${cost} → sale=${newSale}`);
  }

  console.log(`\nDone. Updated ${updated} of ${parts.length} parts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
