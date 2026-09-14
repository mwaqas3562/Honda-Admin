/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Renders an invoice as ESC/POS and writes it to a file ready for the printer.
 *
 * Browser printing needs a driver that rasterises to the printer's language,
 * and this printer only speaks ESC/POS — sending it PostScript makes it print
 * the source code until the paper runs out. Generating ESC/POS directly avoids
 * drivers altogether, which is how most point-of-sale systems drive a thermal
 * printer, and it prints faster and sharper than a rasterised web page.
 *
 * Width is measured, not assumed: an ESC/POS ruler showed 42 characters per
 * line on this printer.
 *
 *   node tools/escpos-receipt.cjs <invoiceId> [outfile]
 */
const fs = require("fs");
const { htmlToRaster } = require("./escpos-image.cjs");

const DOTS = Number(process.env.RECEIPT_DOTS || 504);
const API = process.env.API_BASE || "http://localhost:4000/api/v1";
const EMAIL = process.env.LOGIN_EMAIL || "dev@local.test";
const PASSWORD = process.env.LOGIN_PASSWORD || "dev-password-1234";
const COLS = Number(process.env.RECEIPT_COLS || 42);
const FOOTER_TEXT = process.env.RECEIPT_FOOTER || "آپ کی تشریف آوری کا شکریہ";

const ESC = "\x1b", GS = "\x1d";
const init = ESC + "@";
const alignL = ESC + "a0", alignC = ESC + "a1";
const boldOn = ESC + "E1", boldOff = ESC + "E0";
const dblOn = GS + "!\x01", dblOff = GS + "!\x00";   // double height only
const cut = GS + "V\x00";

const money = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const line = (ch) => ch.repeat(COLS);

/** Wrap text to the column width, so a long part name never overflows. */
function wrap(text, width) {
  const words = String(text).split(/\s+/);
  const out = [];
  let cur = "";
  for (const w of words) {
    if ((cur + (cur ? " " : "") + w).length <= width) cur += (cur ? " " : "") + w;
    else { if (cur) out.push(cur); cur = w.length > width ? w.slice(0, width) : w; }
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

/** name left, then qty/rate/total right-aligned in fixed columns. */
function itemRow(name, qty, rate, total, raw = false) {
  const QTY = 4, RATE = 8, TOT = 9;
  const nameW = COLS - QTY - RATE - TOT;
  const lines = wrap(name, nameW);
  const fmt = raw ? String : money;   // header cells are words, not amounts
  const tail =
    String(qty).padStart(QTY) + fmt(rate).padStart(RATE) + fmt(total).padStart(TOT);
  let out = lines[0].padEnd(nameW) + tail + "\n";
  for (const extra of lines.slice(1)) out += extra + "\n";
  return out;
}

const pair = (l, r) => {
  const gap = COLS - l.length - String(r).length;
  return l + " ".repeat(Math.max(1, gap)) + r + "\n";
};

/** `label` prints bold, `value` plain. Padding is measured on the visible
 *  characters, so the escape codes do not throw the columns out. */
const field = (label, value, pad = 9) => boldOn + label.padEnd(pad) + boldOff + value;

/** Two bold-labelled fields, one left and one right on the same line. */
const fieldPair = (l1, v1, l2, v2) => {
  const left = `${l1} ${v1}`;
  const right = `${l2} ${v2}`;
  const gap = Math.max(1, COLS - left.length - right.length);
  return boldOn + l1 + boldOff + ` ${v1}` + " ".repeat(gap) + boldOn + l2 + boldOff + ` ${v2}\n`;
};

/* The printer's built-in font cannot draw the wing mark and has no Arabic
 * script at all, so the header and footer are rendered by Chrome and sent as
 * rasters. Everything between them stays text: it prints faster, stays sharp,
 * and keeps the column arithmetic honest. */

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const PAGE_CSS = `* { margin:0; padding:0; box-sizing:border-box; }
  body { width:${DOTS}px; background:#fff; color:#000;
         font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }`;

/** Shop name as a bitmap. The printer's built-in font is a dot-matrix face
 *  that looks nothing like the shop's own bill, so the name is rendered by
 *  Chrome and sent as a raster; everything below it stays printer text. */
function headerRaster(shopName) {
  const [first, ...rest] = String(shopName || "Workshop").split(" ");
  /* "Danish Honda / Palace" — the old bill broke the name after the second
   * word, and it is too wide for one line at this size anyway. */
  const line1 = rest.length > 1 ? `${first} ${rest[0]}` : first;
  const line2 = rest.slice(line1.split(" ").length - 1).join(" ");
  return htmlToRaster(`<!doctype html><meta charset="utf-8"><style>${PAGE_CSS}
    .name { font-size:37px; font-weight:700; line-height:1.1; letter-spacing:.5px;
            text-align:center; padding:6px 0 0; }
  </style><div class="name">${esc(line1)}${line2 ? `<br>${esc(line2)}` : ""}</div>`, DOTS);
}

/** Urdu thank-you, in Nastaliq — the right script for Urdu. Set large rather
 *  than stroked: weight on the strokes reads as bold on paper, and the size
 *  alone is enough to carry the hairlines through a 1-bit threshold. */
function footerRaster(text) {
  return htmlToRaster(`<!doctype html><meta charset="utf-8"><style>${PAGE_CSS}
    .u { direction:rtl; text-align:center; padding:4px 0 0;
         font-family:"Noto Nastaliq Urdu",".Noto Nastaliq Urdu UI",".DecoType Nastaleeq Urdu UI","Geeza Pro",sans-serif;
         font-size:26px; font-weight:400; line-height:1.8; }
  </style><div class="u">${esc(text)}</div>`, DOTS);
}

async function main() {
  const invoiceId = process.argv[2];
  const outFile = process.argv[3] || "/tmp/receipt.bin";
  if (!invoiceId) { console.error("usage: node tools/escpos-receipt.cjs <invoiceId> [outfile]"); process.exit(1); }

  /* RECEIPT_TOKEN skips the login round-trip. Reprinting a receipt several
   * times in a row trips the API's 15-minute auth rate limiter, and that
   * limiter is worth keeping. */
  let token = process.env.RECEIPT_TOKEN;
  if (!token) {
    const auth = await fetch(`${API}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }).then((r) => r.json());
    if (!auth.accessToken) { console.error("✗ login failed:", auth.message || auth); process.exit(1); }
    token = auth.accessToken;
  }

  const inv = await fetch(`${API}/invoices/${invoiceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  if (!inv?.invoiceNumber) { console.error("✗ invoice not found"); process.exit(1); }

  const shop = inv.shop || {};
  const parts = (inv.items || []).filter((i) => i.partId);
  const labour = (inv.items || []).filter((i) => !i.partId);
  const date = new Date(inv.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "2-digit",
  });
  const subtotal = Math.round(Number(inv.subtotal) + Number(inv.discountAmt));
  const discount = Math.round(Number(inv.discountAmt));

  let o = init;

  /* Feed clear of the tear bar before printing. The head sits a few
   * millimetres behind the cutter, so the first line lands in the zone the
   * previous cut already passed and prints with its tops sliced off. */
  o += "\n".repeat(Number(process.env.RECEIPT_TOP_FEED || 3));

  /* Header */
  o += alignC;
  o += headerRaster(shop.name).toString("latin1");
  /* contentHeight() trims trailing blank rows, so padding under the name in
   * the HTML is thrown away — the gap has to come from the stream. */
  o += "\n";
  for (const l of wrap(shop.address || "", COLS)) if (l) o += l + "\n";
  if (shop.phone) o += `Ph. ${shop.phone}\n`;
  o += alignL + line("-") + "\n";

  /* Meta */
  o += "\n";
  o += fieldPair("Bill No.", inv.invoiceNumber, "Date", date);
  const meter = inv.jobCard?.meterReading;
  if (meter != null) o += field("Meter", `${money(meter)} KM`) + "\n";
  if (inv.jobCard?.vehicleRegNo) o += field("Reg#", inv.jobCard.vehicleRegNo) + "\n";
  o += field("Customer", inv.customer?.name ?? "Walk-in") + "\n";
  o += "\n" + line("-") + "\n";

  /* Columns */
  o += boldOn + itemRow("Item", "Qty", "Rate", "Total", true) + boldOff;
  o += line("-") + "\n\n";

  const section = (label, items) => {
    let s = boldOn + label + "\n" + boldOff + line("-") + "\n";
    for (const it of items) s += itemRow(it.itemName, Number(it.qty), it.rate, it.total) + "\n";
    return s;
  };
  if (parts.length) o += section("Parts", parts);
  if (labour.length) o += section("Z.Labour", labour);

  o += line(".") + "\n";
  o += boldOn;
  o += pair("Sub Total", money(subtotal));
  o += pair("Discount", discount > 0 ? money(discount) : "0");
  o += "\n" + pair("Grand Total", money(inv.totalAmount));
  o += boldOff;

  o += "\n\n" + alignC;
  o += footerRaster(FOOTER_TEXT).toString("latin1");
  o += alignL + "\n\n\n" + cut;

  fs.writeFileSync(outFile, Buffer.from(o, "latin1"));
  console.log(`  ✓ ${outFile}  (${Buffer.byteLength(o, "latin1")} bytes, ${COLS} columns)`);
  console.log("");
  console.log("  --- preview ---");
  const visible = o
    /* a raster is megabytes of binary — stand it in with a marker so the
     * preview stays readable */
    .replace(/\x1dv0\x00[\x00-\xff]{4}[\x00-\xff]*?(?=\n)/g, "[ bitmap ]")
    .replace(/\x1bE[\x00-\xff]/g, "")   // bold on/off
    .replace(/\x1da[\x00-\xff]/g, "")
    .replace(/\x1ba[\x00-\xff]/g, "")   // alignment
    .replace(/\x1d![\x00-\xff]/g, "")   // size
    .replace(/\x1bV[\x00-\xff]/g, "")
    .replace(/\x1dV[\x00-\xff]/g, "")   // cut
    .replace(/\x1b@/g, "");
  for (const l of visible.split("\n")) console.log("  |" + l);
}

main().catch((e) => { console.error(e); process.exit(1); });
