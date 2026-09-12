/* Single source of truth for the API base URL.
 *
 * Accepts either env var name: NEXT_PUBLIC_API_BASE_URL is the one documented
 * in RUNNING.md and the .env examples, NEXT_PUBLIC_API_URL is the one the
 * client modules used to read directly. Next inlines these at build time, so
 * each has to stay a full static `process.env.X` expression here.
 */
const FALLBACK = "http://localhost:4000/api/v1";

const configured =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  FALLBACK;

/** Trailing slashes would produce `//parts` once callers append their path. */
export const API_BASE = configured.replace(/\/+$/, "");

/* A deployed build that falls back to localhost points every visitor's browser
 * at their own machine, and fails with nothing but network errors. Say so. */
if (
  typeof window !== "undefined" &&
  configured === FALLBACK &&
  !["localhost", "127.0.0.1"].includes(window.location.hostname)
) {
  // eslint-disable-next-line no-console
  console.error(
    `[config] NEXT_PUBLIC_API_BASE_URL is not set. Falling back to ${FALLBACK}, ` +
      `which cannot work on a deployed site. Set it in the hosting environment and rebuild.`
  );
}
