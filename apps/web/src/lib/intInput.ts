/**
 * Integer-only input helpers.
 * The system policy is whole numbers only — no decimals, no negatives.
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

export const intInputProps = {
  type: "number" as const,
  step: 1,
  min: 0,
  inputMode: "numeric" as const,
  onKeyDown: blockDecimalKeys,
  onPaste: blockDecimalPaste,
};
