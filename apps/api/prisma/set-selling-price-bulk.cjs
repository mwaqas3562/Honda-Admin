const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const r = await prisma.$executeRawUnsafe(`
    UPDATE "Part"
       SET "sellingPrice" = ROUND("costPrice" * 1.30)::int
     WHERE "isDeleted" = false
       AND "costPrice" > 0;
  `);
  console.log(`Updated ${r} rows.`);
  await prisma.$disconnect();
})();
