/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Renders HTML to a 1-bit ESC/POS raster.
 *
 * ESC/POS text mode only offers the printer's built-in font, which is why the
 * shop name looks like a dot-matrix terminal rather than the old bill. That bill
 * printed its header — logo and name together — as an image, and this does the
 * same: Chrome renders the HTML, sips converts it to BMP, and the pixels become
 * a GS v 0 raster the printer draws directly.
 *
 * Also the only way to print Urdu, which has no place in an ASCII font.
 *
 * Usable two ways: as a CLI for one-off rendering, and as a module —
 * escpos-receipt.cjs requires htmlToRaster() to build its own header and
 * footer, so a receipt is one command rather than a render-and-splice dance.
 *
 *   node tools/escpos-image.cjs <html-file> <out.bin> [widthDots]
 */
const fs = require("fs");
const { execFileSync } = require("child_process");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function htmlToBmp(htmlPath, widthDots, tmpDir) {
  const png = `${tmpDir}/render.png`;
  const bmp = `${tmpDir}/render.bmp`;
  execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--hide-scrollbars",
    "--default-background-color=FFFFFFFF",
    `--screenshot=${png}`,
    `--window-size=${widthDots},2000`,
    `file://${htmlPath}`,
  ], { stdio: "ignore" });
  execFileSync("/usr/bin/sips", ["-s", "format", "bmp", png, "--out", bmp], { stdio: "ignore" });
  return bmp;
}

/** Minimal BMP reader — enough for what sips writes. */
function readBmp(file) {
  const b = fs.readFileSync(file);
  const dataOffset = b.readUInt32LE(10);
  const width = b.readInt32LE(18);
  const heightRaw = b.readInt32LE(22);
  const bpp = b.readUInt16LE(28);
  const height = Math.abs(heightRaw);
  const bottomUp = heightRaw > 0;
  const bytesPP = bpp / 8;
  const rowSize = Math.floor((bpp * width + 31) / 32) * 4;

  /* true where the pixel is dark enough to burn */
  const dark = (x, y) => {
    const row = bottomUp ? height - 1 - y : y;
    const off = dataOffset + row * rowSize + x * bytesPP;
    if (off + 2 >= b.length) return false;
    const lum = 0.299 * b[off + 2] + 0.587 * b[off + 1] + 0.114 * b[off];
    return lum < 160;
  };
  return { width, height, dark };
}

/** Trim trailing blank rows so the receipt does not carry dead white space. */
function contentHeight(img) {
  for (let y = img.height - 1; y >= 0; y--) {
    for (let x = 0; x < img.width; x++) if (img.dark(x, y)) return y + 1;
  }
  return 0;
}

function toRaster(img, widthDots) {
  const h = contentHeight(img);
  if (h === 0) return Buffer.alloc(0);
  const bytesPerRow = Math.ceil(widthDots / 8);
  const body = Buffer.alloc(bytesPerRow * h, 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < widthDots; x++) {
      if (x < img.width && img.dark(x, y)) {
        body[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  // GS v 0 m xL xH yL yH  — raster bit image
  const head = Buffer.from([
    0x1d, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    h & 0xff, (h >> 8) & 0xff,
  ]);
  return Buffer.concat([head, body]);
}

/** HTML string -> ESC/POS raster bytes. */
function htmlToRaster(html, widthDots = 504) {
  const dir = fs.mkdtempSync("/tmp/escpos-");
  const htmlFile = `${dir}/in.html`;
  fs.writeFileSync(htmlFile, html);
  try {
    return toRaster(readBmp(htmlToBmp(htmlFile, widthDots, dir)), widthDots);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { htmlToRaster, htmlToBmp, readBmp, toRaster, contentHeight };

if (require.main === module) {
  const [htmlPath, outPath, widthArg] = process.argv.slice(2);
  if (!htmlPath || !outPath) {
    console.error("usage: node tools/escpos-image.cjs <html-file> <out.bin> [widthDots]");
    process.exit(1);
  }
  const widthDots = Number(widthArg || process.env.RECEIPT_DOTS || 504);
  const tmpDir = fs.mkdtempSync("/tmp/escpos-");
  const bmp = htmlToBmp(require("path").resolve(htmlPath), widthDots, tmpDir);
  const img = readBmp(bmp);
  const raster = toRaster(img, widthDots);
  fs.writeFileSync(outPath, raster);
  console.log(`  \u2713 ${outPath}  ${raster.length} bytes  (${widthDots} dots wide, ${contentHeight(img)} rows)`);
}
