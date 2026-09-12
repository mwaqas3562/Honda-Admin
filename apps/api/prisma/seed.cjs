/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Seed script: creates 1 shop, 4 roles, and 4 users (one per role).
 * Uses DIRECT_URL for raw connection.
 *
 * Run:  node prisma/seed.cjs
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

async function main() {
  console.log("→ Seeding Honda Workshop database…");

  // 1. Shop
  const shop = await prisma.shop.upsert({
    where: { code: "HONDA-MAIN" },
    update: {},
    create: { code: "HONDA-MAIN", name: "Honda Workshop — Main Branch" },
  });
  console.log("  Shop:", shop.name);

  // 2. Roles
  const roleNames = ["SUPER_ADMIN", "SHOP_ADMIN", "STOREKEEPER", "JOB_CARD_MANAGER"];
  const roles = {};
  for (const name of roleNames) {
    const r = await prisma.role.upsert({
      where: { shopId_name: { shopId: shop.id, name } },
      update: {},
      create: { shopId: shop.id, name, description: `${name} role` },
    });
    roles[name] = r;
  }
  console.log("  Roles:", Object.keys(roles).join(", "));

  // 3. Users (one per role) — password: "password123"
  const password = "password123";
  const passwordHash = await bcrypt.hash(password, 10);

  const users = [
    { email: "admin@honda.local",      fullName: "Super Admin",       role: "SUPER_ADMIN" },
    { email: "manager@honda.local",    fullName: "Shop Manager",      role: "SHOP_ADMIN" },
    { email: "store@honda.local",      fullName: "Storekeeper Sara",  role: "STOREKEEPER" },
    { email: "jobcard@honda.local",    fullName: "Job Card Mgr Jamil", role: "JOB_CARD_MANAGER" },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, roleId: roles[u.role].id, shopId: shop.id, fullName: u.fullName },
      create: {
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        shopId: shop.id,
        roleId: roles[u.role].id,
      },
    });
  }

  console.log("");
  console.log("✓ Seed complete. Login credentials (password: password123):");
  console.log("");
  for (const u of users) {
    console.log(`    ${u.role.padEnd(18)}  ${u.email}`);
  }
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
