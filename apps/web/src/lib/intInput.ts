/**
 * Integer-only input helpers.
 * The system policy is whole numbers only — no decimals, no negatives.
 *
 * Arrow-key, scroll-wheel and select-the-placeholder-zero behaviour is NOT
 * here: it lives in components/NumberFieldGuards, mounted once in the
 * dashboard layout and applied by delegation. Duplicating it as per-input
 * props would double up — a focusin select from the guard and an onFocus
 * select from the props — on any field that used both.
 */
import type { KeyboardEvent, ClipboardEvent } from "react";

const BLOCKED_KEYS = new Set([".", ",", "e", "E", "+", "-"]);

export function blockDecimalKeys(e: KeyboardEvent<HTMLInputElement>): void {
  if (BLOCKED_KEYS.has(e.key)) {
    e.preventDefault();
  }
}

export function blockDecimalPaste(e: ClipboardEvent<HTMLInputElement>): void {
  const text = e.clipboardData.getData("text");
  if (/[^0-9]/.test(text)) {
    e.preventDefault();
  }
}
