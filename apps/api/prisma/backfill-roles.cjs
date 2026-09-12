/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

// Use direct URL for migration/backfill scripts to bypass connection pooler
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

const ROLE_NAMES = ["SUPER_ADMIN", "SHOP_ADMIN", "STOREKEEPER", "JOB_CARD_MANAGER"];

async function hasColumn(tableName, columnName) {
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS "exists"
  `,
    tableName,
    columnName
  );

  return Boolean(rows?.[0]?.exists);
}

async function ensureRolesPerShop() {
  const shops = await prisma.shop.findMany({
    where: { isDeleted: false },
    select: { id: true },
  });

  if (shops.length === 0) {
    console.log("No shops found; skipping role creation.");
    return;
  }

  for (const shop of shops) {
    for (const name of ROLE_NAMES) {
      await prisma.role.upsert({
        where: {
          shopId_name: {
            shopId: shop.id,
            name,
          },
        },
        update: {},
        create: {
          shopId: shop.id,
          name,
          description: `${name} role`,
        },
      });
    }
  }
}

async function backfillFromLegacyRoleColumn() {
  const hasLegacyRoleColumn = await hasColumn("User", "role");
  const hasRoleIdColumn = await hasColumn("User", "roleId");

  if (!hasRoleIdColumn) {
    throw new Error('Missing column public."User"."roleId". Run Prisma migration first.');
  }

  if (hasLegacyRoleColumn) {
    const updatedRows = await prisma.$executeRawUnsafe(`
      UPDATE "User" u
      SET "roleId" = r.id
      FROM "Role" r
      WHERE u."roleId" IS NULL
        AND u."role" IS NOT NULL
        AND r."shopId" = u."shopId"
        AND r."name"::text = u."role"::text
    `);

    console.log(`Backfilled roleId from legacy role column for ${updatedRows} user(s).`);
  } else {
    console.log("Legacy role column not found; skipping legacy role-based backfill.");
  }

  const missingRoleUsers = await prisma.user.count({ where: { roleId: "" } });
  if (missingRoleUsers > 0) {
    console.log(`Warning: ${missingRoleUsers} user(s) still have empty roleId.`);
    console.log("Assign roleId manually or run an additional user-specific mapping.");
  } else {
    console.log("All users have roleId assigned.");
  }
}

async function main() {
  await ensureRolesPerShop();
  await backfillFromLegacyRoleColumn();
  console.log("RBAC role backfill completed.");
}

main()
  .catch((error) => {
    console.error("RBAC backfill failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
