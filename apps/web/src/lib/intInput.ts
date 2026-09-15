/**
 * Integer-only input helpers.
 * The system policy is whole numbers only — no decimals, no negatives.
 */
import type { KeyboardEvent, ClipboardEvent, FocusEvent, WheelEvent } from "react";

const BLOCKED_KEYS = new Set([".", ",", "e", "E", "+", "-"]);

/* A number input's spinner also answers to the arrow keys, so a stray press
 * while tabbing through a bill silently moves an amount by one — and nothing
 * on screen says it happened. Amounts change only by typing. */
const SPINNER_KEYS = new Set(["ArrowUp", "ArrowDown"]);

export function blockDecimalKeys(e: KeyboardEvent<HTMLInputElement>): void {
  if (BLOCKED_KEYS.has(e.key) || SPINNER_KEYS.has(e.key)) {
    e.preventDefault();
  }
}

export function blockDecimalPaste(e: ClipboardEvent<HTMLInputElement>): void {
  const text = e.clipboardData.getData("text");
  if (/[^0-9]/.test(text)) {
    e.preventDefault();
  }
}

/** The same accident as the arrow keys: scrolling the page with the cursor
 *  resting on a focused number input scrolls its value instead. */
export function blockWheel(e: WheelEvent<HTMLInputElement>): void {
  if (document.activeElement === e.currentTarget) {
    e.currentTarget.blur();
  }
}

/** Amount fields sit at 0 rather than empty, so typing into one appends and
 *  500 becomes 0500. Selecting the contents on focus makes the first keystroke
 *  replace the placeholder zero, which is what every till does. */
export function selectOnFocus(e: FocusEvent<HTMLInputElement>): void {
  e.currentTarget.select();
}

/** Drops a leading zero left behind when the caret was moved by hand rather
 *  than the field being focused fresh. "0500" -> "500", "000" -> "0", "" -> "". */
export function stripLeadingZeros(raw: string): string {
  if (raw === "") return "";
  const cleaned = raw.replace(/^0+(?=\d)/, "");
  return cleaned === "" ? "0" : cleaned;
}

export const intInputProps = {
  type: "number" as const,
  step: 1,
  min: 0,
  inputMode: "numeric" as const,
  onKeyDown: blockDecimalKeys,
  onPaste: blockDecimalPaste,
  onFocus: selectOnFocus,
  onWheel: blockWheel,
};
