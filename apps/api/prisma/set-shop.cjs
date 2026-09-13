/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Updates the shop's printed identity — the name, address and phone that
 * appear at the top of every invoice. There is no screen for this in the app,
 * so it is done here.
 *
 * Run:
 *   SHOP_NAME='Danish Honda Palace' \
 *   SHOP_ADDRESS='Near LDA Ground Round About, Opp. Soneri Bank, 22-KM Mian Ferozpur Rd, Lhr' \
 *   SHOP_PHONE='0370-5097234' \
 *   npm --workspace apps/api run shop:set
 *
 * Targets the shop with code SHOP_CODE (default HONDA-MAIN). Only the
 * variables you provide are changed; the rest are left as they are.
 */
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("✗ Set DIRECT_URL (or DATABASE_URL) first.");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const code = process.env.SHOP_CODE || "HONDA-MAIN";

async function main() {
  const existing = await prisma.shop.findUnique({ where: { code } });
  if (!existing) {
    console.error(`✗ No shop with code "${code}". Existing codes:`);
    for (const s of await prisma.shop.findMany({ select: { code: true, name: true } })) {
      console.error(`    ${s.code}  —  ${s.name}`);
    }
    process.exit(1);
  }

  const data = {};
  if (process.env.SHOP_NAME) data.name = process.env.SHOP_NAME.trim();
  if (process.env.SHOP_ADDRESS) data.address = process.env.SHOP_ADDRESS.trim();
  if (process.env.SHOP_PHONE) data.phone = process.env.SHOP_PHONE.trim();

  if (!Object.keys(data).length) {
    console.log("Nothing to change. Current values:");
    console.log(`    name:    ${existing.name}`);
    console.log(`    address: ${existing.address ?? "(not set)"}`);
    console.log(`    phone:   ${existing.phone ?? "(not set)"}`);
    return;
  }

  const updated = await prisma.shop.update({ where: { code }, data });

  console.log("");
  console.log(`✓ Updated shop ${code}`);
  for (const f of ["name", "address", "phone"]) {
    const before = existing[f] ?? "(not set)";
    const after = updated[f] ?? "(not set)";
    console.log(`    ${f.padEnd(8)} ${before === after ? `${after}  (unchanged)` : `${before}  →  ${after}`}`);
  }
  console.log("");
  console.log("  Invoices print these values directly, so existing bills reprint with the new details.");
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
