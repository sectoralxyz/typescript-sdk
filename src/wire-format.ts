/**
 * The REST API talks snake_case; this SDK presents camelCase, because that is
 * what TypeScript callers expect to write. Bodies and query parameters are
 * rewritten on the way out, responses on the way back in.
 *
 * Only plain objects and arrays are walked. Strings, numbers, dates, and
 * anything else with a prototype of its own are handed through untouched, so a
 * value that merely looks like a record is never quietly restructured.
 */

function snakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function camelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function rekey(value: unknown, mapKey: (key: string) => string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => rekey(item, mapKey));
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[mapKey(key)] = rekey(val, mapKey);
    }
    return result;
  }
  return value;
}

/** Convert a camelCase structure into the snake_case shape the API expects. */
export function toWire<T = unknown>(value: unknown): T {
  return rekey(value, snakeCase) as T;
}

/** Convert a snake_case API response into the camelCase shape callers see. */
export function fromWire<T = unknown>(value: unknown): T {
  return rekey(value, camelCase) as T;
}
