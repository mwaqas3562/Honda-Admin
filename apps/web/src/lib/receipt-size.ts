/**
 * Physical size of the thermal receipt.
 *
 * Bills were printing clipped on both edges, which happens when the layout is
 * wider than the print head covers. That width varies by printer — an 80mm roll
 * typically prints 72mm, a 58mm roll prints 54mm — and the only reliable way to
 * find it is to print the calibration page at /dashboard/print-test.
 *
 * Both values are read at build time by Next, so changing them needs a redeploy,
 * not just a restart.
 *
 *   NEXT_PUBLIC_RECEIPT_PAGE_MM   the paper width handed to @page
 *   NEXT_PUBLIC_RECEIPT_WIDTH_MM  the printable width the content is laid out at
 */
function mm(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 30 && n <= 120 ? n : fallback;
}

/* Defaults measured against the shop's own printer, not taken from a spec
 * sheet. An ESC/POS ruler showed 42 characters per line in Font A — 504 dots,
 * 63mm at 203dpi — where an 80mm printer would normally give 48 characters and
 * 72mm. Laying out at 72mm is what clipped both edges. */
export const RECEIPT_PAGE_MM = mm(process.env.NEXT_PUBLIC_RECEIPT_PAGE_MM, 63);
export const RECEIPT_WIDTH_MM = mm(process.env.NEXT_PUBLIC_RECEIPT_WIDTH_MM, 63);

/** Side padding, so content never touches the very edge of the print head. */
export const RECEIPT_SIDE_PAD_MM = 1.5;
