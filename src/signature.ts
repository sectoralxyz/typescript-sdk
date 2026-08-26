import { SectoralError } from "./errors.js";

/**
 * Check an `X-Sectoral-Signature` header against the body it claims to sign.
 * The header is an HMAC-SHA256 of the raw bytes, keyed by the webhook secret.
 *
 * Verification runs on Web Crypto, which Node 18 and later, current browsers,
 * and the edge runtimes all provide. The final comparison is written to take
 * the same time whether the first byte differs or the last, so an attacker
 * cannot recover the expected digest by measuring how quickly we say no.
 */
export async function verifyWebhookSignature(params: {
  payload: string | Uint8Array;
  signature: string;
  secret: string;
}): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new SectoralError(
      "Web Crypto is unavailable in this runtime, so webhook signatures cannot be verified.",
    );
  }

  const encoder = new TextEncoder();
  const key = await subtle.importKey(
    "raw",
    encoder.encode(params.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const data =
    typeof params.payload === "string" ? encoder.encode(params.payload) : params.payload;
  const digest = await subtle.sign("HMAC", key, data as BufferSource);
  const expected = toHex(new Uint8Array(digest));

  return constantTimeEquals(expected, params.signature.trim().toLowerCase());
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i++) {
    differences |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return differences === 0;
}
