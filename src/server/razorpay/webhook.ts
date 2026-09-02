import crypto from "crypto";

/**
 * Checks whether RAZORPAY_WEBHOOK_SECRET is configured in the server environment.
 */
export function isRazorpayWebhookConfigured(): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  return typeof secret === "string" && secret.trim().length > 0;
}

/**
 * Computes the HMAC-SHA256 hex digest for a raw webhook payload string against a secret.
 */
export function computeRazorpayWebhookSignature(
  rawBody: string,
  secret: string
): string {
  return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * Performs a constant-time comparison of two signature strings using crypto.timingSafeEqual
 * to prevent timing side-channel attacks.
 */
function timingSafeSignatureCompare(expectedHex: string, providedHex: string): boolean {
  if (typeof expectedHex !== "string" || typeof providedHex !== "string") {
    return false;
  }

  const expectedBuf = Buffer.from(expectedHex, "utf8");
  const providedBuf = Buffer.from(providedHex, "utf8");

  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Verifies the incoming Razorpay webhook signature (X-Razorpay-Signature header)
 * against the raw request body and RAZORPAY_WEBHOOK_SECRET.
 *
 * SAFETY & SECURITY INVARIANTS:
 * 1. Must be provided the EXACT raw unparsed request body string (not JSON.stringify(body)).
 * 2. Uses timing-safe constant-time comparison to prevent timing attacks.
 * 3. Never logs or outputs the secret, the expected signature, or the provided signature.
 * 4. Fails closed (returns false) on any missing or malformed inputs.
 *
 * @param rawBody - Raw body payload string received from the HTTP request
 * @param signature - Signature from the `X-Razorpay-Signature` request header
 * @param customSecret - Optional override secret (primarily for testing)
 * @returns boolean indicating whether the signature is valid
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string,
  customSecret?: string
): boolean {
  const secret = customSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET;

  if (typeof secret !== "string" || secret.trim().length === 0) {
    return false;
  }

  if (typeof rawBody !== "string" || rawBody.length === 0) {
    return false;
  }

  if (typeof signature !== "string" || signature.trim().length === 0) {
    return false;
  }

  try {
    const expectedSignature = computeRazorpayWebhookSignature(rawBody, secret.trim());
    return timingSafeSignatureCompare(expectedSignature, signature.trim());
  } catch {
    return false;
  }
}
