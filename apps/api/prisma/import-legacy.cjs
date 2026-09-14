/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Imports the catalogue from the legacy InventorySol (SQL Server) system.
 *
 * Reads pipe-separated exports produced from the restored `Sol` database and
 * upserts them into the current schema. Idempotent: matching is by the natural
 * key the schema already enforces (Part.sku, Vendor.code, Mechanic.name), so
 * re-running updates rather than duplicating.
 *
 * Run:
 *   LEGACY_DIR=/path/to/exports npm --workspace apps/api run import:legacy
 *
 * Options:
 *   DRY_RUN=1     report what would change, write nothing
 *   SHOP_CODE     defaults to HONDA-MAIN
 *
 * Notes on the mapping:
 *   - Stock is computed from tbl_ItemLedger (in − out), not the Items.QtyIn
 *     column, which holds an opening figure and is populated on only ~4% of rows.
 *   - Negative computed stock is clamped to 0. It comes from service lines sold
 *     without ever being received, plus eleven years of drift; a negative
 *     quantity is not representable as stock on hand.
 *   - unitPrice mirrors costPrice, matching how the schema documents it.
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error("✗ Set DIRECT_URL (or DATABASE_URL) first."); process.exit(1); }

const prisma = new PrismaClient({ datasources: { db: { url } } });
const DIR = process.env.LEGACY_DIR;
const DRY = process.env.DRY_RUN === "1";
const SHOP_CODE = process.env.SHOP_CODE || "HONDA-MAIN";
const SEP = "~|~";

function read(file) {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n")
    .map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(SEP).map((c) => c.trim()));
}

const toInt = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; };

async function main() {
  if (!DIR) { console.error("✗ Set LEGACY_DIR to the folder holding items.psv / vendors.psv / mechanics.psv"); process.exit(1); }

  const shop = await prisma.shop.findUnique({ where: { code: SHOP_CODE } });
  if (!shop) { console.error(`✗ No shop with code "${SHOP_CODE}".`); process.exit(1); }

  console.log("");
  console.log(`  target : ${shop.name} (${shop.code})`);
  console.log(`  source : ${DIR}`);
  console.log(`  mode   : ${DRY ? "DRY RUN — nothing will be written" : "WRITE"}`);
  console.log("");

  /* ── Parts ─────────────────────────────────────────────── */
  const items = read("items.psv");
  let created = 0, updated = 0, clamped = 0, skipped = 0;

  for (const [sku, , name, cost, sale, rawStock, minLvl] of items) {
    if (!sku || !name) { skipped++; continue; }
    const raw = toInt(rawStock);
    const stockQty = raw < 0 ? 0 : raw;
    if (raw < 0) clamped++;
    const costPrice = toInt(cost);
    const data = {
      name,
      costPrice,
      unitPrice: costPrice,          // schema documents this as a mirror of cost
      sellingPrice: toInt(sale),
      stockQty,
      minStockLevel: toInt(minLvl),
    };
    if (DRY) { created++; continue; }
    const existing = await prisma.part.findUnique({
      where: { shopId_sku: { shopId: shop.id, sku } },
      select: { id: true },
    });
    if (existing) { await prisma.part.update({ where: { id: existing.id }, data }); updated++; }
    else { await prisma.part.create({ data: { ...data, sku, shopId: shop.id } }); created++; }
  }
  console.log(`  parts     : ${created} created, ${updated} updated, ${skipped} skipped`);
  console.log(`              ${clamped} had negative computed stock, clamped to 0`);

  /* ── Vendors ───────────────────────────────────────────── */
  const vendors = read("vendors.psv");
  let vc = 0, vu = 0;
  for (const [name, code, phone, address] of vendors) {
    if (!name || !code) continue;
    const data = { name, phone: phone || null, address: address || null };
    if (DRY) { vc++; continue; }
    const existing = await prisma.vendor.findUnique({
      where: { shopId_code: { shopId: shop.id, code } }, select: { id: true },
    });
    if (existing) { await prisma.vendor.update({ where: { id: existing.id }, data }); vu++; }
    else { await prisma.vendor.create({ data: { ...data, code, shopId: shop.id } }); vc++; }
  }
  console.log(`  vendors   : ${vc} created, ${vu} updated`);

  /* ── Mechanics ─────────────────────────────────────────── */
  const mechanics = read("mechanics.psv");
  let mc = 0, mu = 0;
  for (const [name] of mechanics) {
    if (!name) continue;
    if (DRY) { mc++; continue; }
    const existing = await prisma.mechanic.findFirst({
      where: { shopId: shop.id, name }, select: { id: true },
    });
    if (existing) { mu++; } else { await prisma.mechanic.create({ data: { name, shopId: shop.id } }); mc++; }
  }
  console.log(`  mechanics : ${mc} created, ${mu} already present`);
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
