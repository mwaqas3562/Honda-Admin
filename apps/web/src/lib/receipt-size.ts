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

/* Defaults taken from the shop's printer as Windows reports it — a Citizen
 * CBM1000 Type II: 80mm paper, 71.9mm printable, and a 4mm strip down the left
 * the head physically cannot reach.
 *
 * An earlier guess of 63mm came from counting 42 characters per line with an
 * ESC/POS ruler and assuming a 12-dot character cell. That inference was wrong:
 * the driver offers both 48-column and 42-column modes on the same 80mm paper,
 * so the column count describes a font, not a width. Measure the paper, not the
 * text. */
export const RECEIPT_PAGE_MM = mm(process.env.NEXT_PUBLIC_RECEIPT_PAGE_MM, 80);
export const RECEIPT_WIDTH_MM = mm(process.env.NEXT_PUBLIC_RECEIPT_WIDTH_MM, 70);

/** Left inset clearing the head's dead zone, with a millimetre to spare.
 *
 *  This has to live in the stylesheet rather than the print dialog: the page
 *  sets `@page { margin: 0 }`, which overrides the dialog's Margins setting, so
 *  choosing "Default" there does nothing. Content runs 5mm-75mm on 80mm paper,
 *  inside the 4mm-75.9mm the head can actually print. */
export const RECEIPT_LEFT_MM = mm(process.env.NEXT_PUBLIC_RECEIPT_LEFT_MM, 5);

/** Side padding, so content never touches the very edge of the print head. */
export const RECEIPT_SIDE_PAD_MM = 1.5;
