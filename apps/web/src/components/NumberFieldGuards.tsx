"use client";

import { useEffect } from "react";

/**
 * Makes every number field in the dashboard behave like a till keypad.
 *
 * Two accidents this prevents, both of which change money silently:
 *
 *  - Arrow keys drive a number input's spinner. Tabbing through a bill and
 *    brushing Up or Down moves an amount by one with nothing on screen to say
 *    it happened.
 *  - So does the scroll wheel, whenever the cursor happens to rest over a
 *    focused amount while the page is scrolled.
 *
 * And one nuisance: amount fields sit at 0 rather than empty, so typing 500
 * into one produced 0500. Focusing a field that reads exactly "0" selects it,
 * so the first keystroke replaces the placeholder. Fields holding a real value
 * are left alone, because there the caret position is usually the point.
 *
 * Done by delegation rather than per-input props deliberately: the app has 30
 * of these across a dozen screens, and a prop that has to be remembered is a
 * prop that will be forgotten on the next one.
 */
const isNumberField = (el: EventTarget | null): el is HTMLInputElement =>
  el instanceof HTMLInputElement && el.type === "number";

export default function NumberFieldGuards() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isNumberField(e.target)) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      if (isNumberField(document.activeElement) && document.activeElement === e.target) {
        /* Blurring lets the page scroll normally instead of eating the gesture. */
        (document.activeElement as HTMLInputElement).blur();
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if (!isNumberField(el)) return;
      if (el.readOnly || el.disabled) return;
      /* focusin lands before the click positions the caret, and that click
         would clear a selection made here — so defer past it. */
      if (el.value === "0") setTimeout(() => { if (document.activeElement === el) el.select(); }, 0);
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("wheel", onWheel, { capture: true, passive: true });
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("wheel", onWheel, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return null;
}
