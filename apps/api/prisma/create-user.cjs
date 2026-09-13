/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Creates or updates a single user with a given role.
 *
 * The application has no screen for adding staff, so accounts are made here.
 * Re-running for an existing email resets that user's password and role rather
 * than creating a duplicate.
 *
 * Run:
 *   EMAIL='someone@example.com' PASSWORD='…' ROLE='STOREKEEPER' NAME='Their Name' \
 *   npm --workspace apps/api run user:create
 *
 * ROLE is one of SUPER_ADMIN, SHOP_ADMIN, STOREKEEPER, JOB_CARD_MANAGER.
 * Optional: SHOP_CODE (default HONDA-MAIN).
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("✗ Set DIRECT_URL (or DATABASE_URL) first.");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const ROLES = ["SUPER_ADMIN", "SHOP_ADMIN", "STOREKEEPER", "JOB_CARD_MANAGER"];

async function main() {
  const email = (process.env.EMAIL || "").trim().toLowerCase();
  const password = process.env.PASSWORD || "";
  const roleName = (process.env.ROLE || "").trim().toUpperCase();
  const fullName = process.env.NAME || email.split("@")[0];
  const shopCode = process.env.SHOP_CODE || "HONDA-MAIN";

  const problems = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push("EMAIL must be a valid email address.");
  if (!password) problems.push("PASSWORD is required.");
  if (!ROLES.includes(roleName)) problems.push(`ROLE must be one of: ${ROLES.join(", ")}`);
  if (problems.length) {
    console.error("✗ Cannot create user:");
    for (const p of problems) console.error("   - " + p);
    process.exit(1);
  }

  const shop = await prisma.shop.findUnique({ where: { code: shopCode } });
  if (!shop) {
    console.error(`✗ No shop with code "${shopCode}".`);
    process.exit(1);
  }
  const role = await prisma.role.findUnique({
    where: { shopId_name: { shopId: shop.id, name: roleName } },
  });
  if (!role) {
    console.error(`✗ Role ${roleName} does not exist for shop ${shopCode}. Run the seed first.`);
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_COST || 12));

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, roleId: role.id, shopId: shop.id, fullName, isActive: true, isDeleted: false },
    create: { email, fullName, passwordHash, shopId: shop.id, roleId: role.id },
  });

  console.log("");
  console.log(`✓ ${existing ? "Updated" : "Created"} user`);
  console.log(`    email : ${user.email}`);
  console.log(`    name  : ${user.fullName}`);
  console.log(`    role  : ${roleName}`);
  console.log(`    shop  : ${shop.name} (${shop.code})`);

  /* Weak passwords are allowed — this is an operator's tool — but not silently. */
  if (password.length < 8 || /^(?:\d+|password|admin|test)$/i.test(password)) {
    console.log("");
    console.log("⚠  That password is easy to guess. This system is reachable from the");
    console.log("   internet and this account can create and edit invoices, job cards");
    console.log("   and cash entries. Consider re-running with a stronger one.");
  }
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
