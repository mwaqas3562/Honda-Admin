const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const total = await prisma.part.count({ where: { isDeleted: false } });
  const withSale = await prisma.part.count({
    where: { isDeleted: false, sellingPrice: { gt: 0 } },
  });
  const sums = await prisma.part.aggregate({
    where: { isDeleted: false },
    _sum: { costPrice: true, sellingPrice: true },
  });
  const sample = await prisma.part.findMany({
    where: { isDeleted: false },
    select: { sku: true, name: true, costPrice: true, sellingPrice: true },
    orderBy: { sku: "asc" },
    take: 5,
  });
  console.log("Total parts          :", total);
  console.log("Parts with sale > 0  :", withSale);
  console.log("Sum costPrice        :", sums._sum.costPrice);
  console.log("Sum sellingPrice     :", sums._sum.sellingPrice);
  console.log(
    "Avg margin           :",
    sums._sum.costPrice
      ? `${((Number(sums._sum.sellingPrice) / Number(sums._sum.costPrice)) * 100 - 100).toFixed(1)}%`
      : "n/a"
  );
  console.log("\nSample:");
  for (const p of sample) {
    console.log(`  ${p.sku.padEnd(8)} ${p.name.slice(0, 30).padEnd(30)} cost=${p.costPrice} sale=${p.sellingPrice}`);
  }
  await prisma.$disconnect();
})();
