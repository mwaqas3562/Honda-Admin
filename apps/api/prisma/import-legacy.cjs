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

/** Legacy dates arrive as "2026-09-05 00:00:00" with no zone. `new Date()` reads
 *  that as local time, which on a UTC+5 machine stores it as 19:00 the previous
 *  day and moves every midnight-stamped record back a day. The legacy values are
 *  business dates, so they are pinned to UTC midnight — matching how the rest of
 *  the system stores entry dates. */
const toDate = (v) => {
  if (!v) return undefined;
  const s = String(v).trim().replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

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

  /* ── Services ──────────────────────────────────────────
   * The legacy system kept labour inside its Items table with no price — the
   * rate was typed per invoice. They are not stock, so they are imported as
   * Services with their average charged rate, and their invoice lines land
   * with no part link, which is exactly how this schema represents labour. */
  const services = read("services.psv");
  let sc = 0, su = 0;
  for (const [name, rate] of services) {
    if (!name) continue;
    const existing = await prisma.service.findFirst({
      where: { shopId: shop.id, name }, select: { id: true },
    });
    if (existing) { su++; continue; }
    if (!DRY) await prisma.service.create({ data: { shopId: shop.id, name, defaultPrice: toInt(rate) } });
    sc++;
  }
  console.log(`  services  : ${sc} created, ${su} already present`);

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

  if (process.env.WITH_HISTORY === "1" && !DRY) await importHistory(shop);
  console.log("");
}


/* ─────────────────────────────────────────────────────────────
 * History: customers, job cards, invoices.
 * Only runs when WITH_HISTORY=1, so the catalogue import stays usable alone.
 * ───────────────────────────────────────────────────────────── */
async function importHistory(shop) {
  const norm = (p) => (p || "").replace(/[^0-9]/g, "");

  /* ── Customers ──────────────────────────────────────────
   * Keyed on phone. The legacy system has no customer master — details are
   * retyped on every job card — so the same person appears under many
   * spellings. Phone is the only stable identifier. */
  const custRows = read("customers.psv");
  const custByPhone = new Map();
  let cc = 0, cu = 0;
  for (const [phone, name, firstSeen] of custRows) {
    const key = norm(phone);
    if (!key || !name) continue;
    let cust = await prisma.customer.findFirst({
      where: { shopId: shop.id, phone: key }, select: { id: true },
    });
    if (cust) { cu++; } else {
      cust = await prisma.customer.create({
        /* createdAt is the customer's first recorded visit, not the moment of
         * import — otherwise every customer looks like they joined today. */
        data: { shopId: shop.id, name, phone: key, createdAt: toDate(firstSeen) },
        select: { id: true },
      });
      cc++;
    }
    custByPhone.set(key, cust.id);
  }
  console.log(`  customers : ${cc} created, ${cu} already present`);

  /* ── Job cards ──────────────────────────────────────────
   * jobNumber is unique per shop but the legacy data has a handful of
   * repeats, so later duplicates get a suffix rather than being dropped. */
  const jobRows = read("jobcards.psv");
  const seenJobNo = new Set();
  const jobIdByNo = new Map();
  let jc = 0, js = 0, jdup = 0;

  const mechIdByName = new Map(
    (await prisma.mechanic.findMany({ where: { shopId: shop.id }, select: { id: true, name: true } }))
      .map((m) => [m.name, m.id])
  );

  for (const [jobNo, jobDate, cell, name, regNo, vehType, engType, meter, nextDue, mechName] of jobRows) {
    const phone = norm(cell);
    let customerId = custByPhone.get(phone);
    if (!customerId) {
      if (!name) { js++; continue; }
      const c = await prisma.customer.create({
        data: { shopId: shop.id, name, phone: phone || null, createdAt: toDate(jobDate) },
        select: { id: true },
      });
      customerId = c.id;
      if (phone) custByPhone.set(phone, customerId);
    }
    let jobNumber = jobNo || `LEGACY-${jc + 1}`;
    if (seenJobNo.has(jobNumber)) { jdup++; jobNumber = `${jobNumber}-${jdup}`; }
    seenJobNo.add(jobNumber);

    const created = await prisma.jobCard.create({
      data: {
        shopId: shop.id,
        customerId,
        jobNumber,
        title: "Service",
        vehicleRegNo: regNo || null,
        vehicleType: vehType || null,
        engineType: engType || null,
        meterReading: toInt(meter) || null,
        mechanicId: mechName ? mechIdByName.get(mechName) ?? null : null,
        mechanicAssigned: mechName || null,
        nextDueDate: toDate(nextDue) ?? null,
        status: "COMPLETED",
        isFinal: true,
        finalizedAt: toDate(jobDate),
        createdAt: toDate(jobDate),
      },
      select: { id: true },
    });
    jobIdByNo.set(jobNo, created.id);
    jc++;
  }
  console.log(`  job cards : ${jc} created, ${js} skipped, ${jdup} renamed for duplicate job numbers`);

  /* ── Invoices + lines ───────────────────────────────────
   * stockDeducted is set true on purpose: stock levels were already imported
   * from the legacy ledger, which these sales are part of. Leaving it false
   * would let the app deduct the same units a second time. */
  const partBySku = new Map(
    (await prisma.part.findMany({ where: { shopId: shop.id }, select: { id: true, sku: true, name: true, costPrice: true } }))
      .map((p) => [p.sku, p])
  );
  /* Legacy code → name for every item, labour included. Without this, a labour
   * line falls back to printing its raw ledger code on the receipt, because
   * services deliberately are not in the Part table. */
  const nameByCode = new Map(read("itemnames.psv").map(([code, name]) => [code, name]));

  const linesByInv = new Map();
  for (const [inv, code, qty, rate, cost, total, remarks] of read("invlines.psv")) {
    if (!linesByInv.has(inv)) linesByInv.set(inv, []);
    linesByInv.get(inv).push({ code, qty, rate, cost, total, remarks });
  }

  const invRows = read("invoices.psv");
  const walkInKey = "legacy-walkin-customer";
  let walkInId = null;
  let ic = 0, isk = 0, orphanLines = 0, walkIn = 0;
  for (const [invNo, dated, jobNo, cell, discount, cashPaid, remarks] of invRows) {
    const lines = linesByInv.get(invNo) || [];
    if (lines.length === 0) { isk++; continue; }

    const jobCardId = jobNo ? jobIdByNo.get(jobNo) ?? null : null;
    let customerId = custByPhone.get(norm(cell));
    if (!customerId && jobCardId) {
      const jcRow = await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { customerId: true } });
      customerId = jcRow?.customerId;
    }
    if (!customerId) {
      /* Legacy invoices whose phone matches nobody and whose job number does
       * not resolve. Dropping them would quietly lose real revenue, so they
       * are attached to a single walk-in record and stay findable. */
      if (!walkInId) {
        const w = await prisma.customer.upsert({
          where: { id: walkInKey },
          update: {},
          create: { id: walkInKey, shopId: shop.id, name: "Walk-in Customer (legacy)" },
          select: { id: true },
        });
        walkInId = w.id;
      }
      customerId = walkInId;
      walkIn++;
    }

    const items = [];
    let subtotal = 0, totalCost = 0, labourTotal = 0, partsTotal = 0;
    for (const l of lines) {
      const part = partBySku.get(l.code?.split("-").pop() ?? "") ?? partBySku.get(l.code);
      const qty = toInt(l.qty) || 1;
      const rate = toInt(l.rate);
      const cost = toInt(l.cost) || part?.costPrice || 0;
      const total = toInt(l.total) || qty * rate;
      if (!part) orphanLines++;
      subtotal += total;
      totalCost += cost * qty;
      /* Reports read labour from JobCard.laborAmount, not from the invoice
       * lines, so the split has to be written back to the job card below. */
      if (part) partsTotal += total; else labourTotal += total;
      items.push({
        partId: part?.id ?? null,
        itemCode: l.code || null,
        itemName: part?.name ?? nameByCode.get(l.code) ?? (l.remarks || l.code || "ITEM"),
        qty, rate, total, costPrice: cost,
        profit: total - cost * qty,
        remarks: l.remarks || null,
      });
    }
    const discountAmt = toInt(discount);
    const totalAmount = subtotal - discountAmt;
    const when = toDate(dated);

    await prisma.invoice.create({
      data: {
        shopId: shop.id, customerId, jobCardId,
        invoiceNumber: invNo,
        subtotal, discountAmt, discountPct: 0,
        totalAmount, totalCost, totalProfit: totalAmount - totalCost,
        paidAmount: toInt(cashPaid),
        status: "PAID",
        stockDeducted: true,           // stock already reflects these sales
        jobDetail: remarks || null,
        cellNo: cell || null,
        issuedAt: when, createdAt: when,
        items: { create: items },
      },
    });

    if (jobCardId) {
      await prisma.jobCard.update({
        where: { id: jobCardId },
        data: { laborAmount: labourTotal, partsAmount: partsTotal, totalAmount },
      });
    }
    ic++;
  }
  console.log(`  invoices  : ${ic} created, ${isk} skipped (no line items)`);
  console.log(`              ${walkIn} attached to the walk-in customer`);

  /* ── Purchases (legacy GRN — goods received notes) ──────
   * Imported so the vendor and purchase reports have something to show.
   * Written directly rather than through the service layer, because stock was
   * already imported from the ledger and receiving these again would count the
   * same units twice. */
  const vendorByCode = new Map(
    (await prisma.vendor.findMany({ where: { shopId: shop.id }, select: { id: true, code: true } }))
      .map((v) => [v.code, v.id])
  );
  const plByGrn = new Map();
  for (const [grn, code, qty, rate, total] of read("purchlines.psv")) {
    if (!plByGrn.has(grn)) plByGrn.set(grn, []);
    plByGrn.get(grn).push({ code, qty, rate, total });
  }

  let pc = 0, psk = 0, plSkipped = 0;
  for (const [grnNo, dated, suppCode, cashPaid, remarks] of read("purchases.psv")) {
    const vendorId = vendorByCode.get(suppCode);
    if (!vendorId) { psk++; continue; }
    const lines = (plByGrn.get(grnNo) || [])
      .map((l) => {
        const part = partBySku.get(l.code?.split("-").pop() ?? "") ?? partBySku.get(l.code);
        if (!part) { plSkipped++; return null; }
        const quantity = toInt(l.qty) || 1;
        const costPrice = toInt(l.rate);
        return {
          partId: part.id, quantity, receivedQty: quantity, costPrice,
          totalPrice: toInt(l.total) || quantity * costPrice,
        };
      })
      .filter(Boolean);
    if (lines.length === 0) { psk++; continue; }

    const when = toDate(dated);
    await prisma.purchase.create({
      data: {
        shopId: shop.id, vendorId, purchaseNo: grnNo,
        totalCost: lines.reduce((s, l) => s + l.totalPrice, 0),
        status: "RECEIVED",
        notes: remarks || null,
        purchasedAt: when, receivedAt: when, createdAt: when,
        items: { create: lines },
      },
    });
    pc++;
  }
  console.log(`  purchases : ${pc} created, ${psk} skipped (no vendor or no matching lines)`);
  console.log(`              ${plSkipped} lines referenced a part not in the catalogue`);

  /* ── Stock movement history ────────────────────────────
   * The Stock Logs screen reads these. Normally the app writes one per sale or
   * receipt, but invoices and purchases here were inserted directly, so the
   * legacy ledger is replayed instead. Running balances are recomputed forward
   * per part so each row shows the balance as it stood at that moment.
   * Vtypeid 5 = goods in, 6 = sale out, anything else = adjustment. */
  const logRows = read("stocklogs.psv");
  const partIdBySku = new Map([...partBySku.entries()].map(([sku, p]) => [sku, p.id]));
  const balance = new Map();
  const batch = [];
  let lg = 0, lgSkipped = 0;

  for (const [code, dated, qtyIn, qtyOut, vtype, vno] of logRows) {
    const sku = code?.split("-").pop() ?? "";
    const partId = partIdBySku.get(sku);
    if (!partId) { lgSkipped++; continue; }
    const change = toInt(qtyIn) - toInt(qtyOut);
    if (change === 0) { lgSkipped++; continue; }
    const bal = (balance.get(partId) ?? 0) + change;
    balance.set(partId, bal);
    batch.push({
      shopId: shop.id, partId, changeQty: change, balanceQty: bal,
      logType: vtype === "5" ? "PURCHASE_IN" : vtype === "6" ? "JOBCARD_OUT" : "ADJUSTMENT",
      notes: vno ? `Legacy ${vno}` : null,
      createdAt: toDate(dated),
    });
    if (batch.length >= 1000) {
      await prisma.stockLog.createMany({ data: batch.splice(0, batch.length) });
      lg += 1000;
    }
  }
  if (batch.length) { await prisma.stockLog.createMany({ data: batch }); lg += batch.length; }
  console.log(`  stock logs: ${lg} created, ${lgSkipped} skipped (no part match or zero movement)`);

  /* ── Document numbering ────────────────────────────────
   * Job numbers come from a per-shop counter, and an invoice takes its number
   * from the job card it belongs to. Left at zero, the next job issued would be
   * number 1 — a jump back from the legacy 88,914 that staff would not trust —
   * and as the counter climbed it would eventually collide with an imported
   * number and break the unique constraint on (shopId, jobNumber).
   * So the counter is moved past the highest number already in use. */
  const maxJob = (await prisma.jobCard.findMany({
    where: { shopId: shop.id },
    select: { jobNumber: true },
  })).reduce((m, j) => {
    /* Only whole-number job numbers count. The duplicates renamed above carry a
     * "-1" suffix, and stripping the dash would turn 87354-6 into 873546 and
     * push the counter hundreds of thousands ahead. */
    const s = String(j.jobNumber);
    if (!/^\d+$/.test(s)) return m;
    const n = Number(s);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);

  const maxPurchase = (await prisma.purchase.findMany({
    where: { shopId: shop.id }, select: { purchaseNo: true },
  })).reduce((m, x) => {
    const s = String(x.purchaseNo);
    if (!/^\d+$/.test(s)) return m;
    const n = Number(s);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);

  for (const [kind, val] of [["JOB_CARD", maxJob], ["INVOICE", maxJob], ["PURCHASE", maxPurchase]]) {
    if (val <= 0) continue;
    const cur = await prisma.numberSequence.findUnique({
      where: { shopId_kind: { shopId: shop.id, kind } }, select: { lastValue: true },
    });
    if ((cur?.lastValue ?? 0) >= val) continue;
    await prisma.numberSequence.upsert({
      where: { shopId_kind: { shopId: shop.id, kind } },
      create: { shopId: shop.id, kind, lastValue: val },
      update: { lastValue: val },
    });
  }
  console.log(`  numbering : next job card ${maxJob + 1}, next purchase ${maxPurchase + 1}`);



  console.log(`              ${orphanLines} lines referenced an item not in the catalogue`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
