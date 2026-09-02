import Razorpay from "razorpay";

/**
 * Custom error thrown when Razorpay credentials are missing or invalid in server environment.
 */
export class RazorpayConfigurationError extends Error {
  constructor(message = "Razorpay credentials are not configured in the server environment.") {
    super(message);
    this.name = "RazorpayConfigurationError";
  }
}

let cachedRazorpayClient: Razorpay | null = null;

/**
 * Checks whether both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are configured on the server.
 */
export function isRazorpayConfigured(): boolean {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  return (
    typeof keyId === "string" &&
    keyId.trim().length > 0 &&
    typeof keySecret === "string" &&
    keySecret.trim().length > 0
  );
}

/**
 * Returns a server-side singleton Razorpay client instance.
 * Throws a RazorpayConfigurationError if credentials are not configured.
 *
 * SAFETY INVARIANT:
 * This client must ONLY be used in server-side contexts (Server Actions, Route Handlers, Server Services).
 * Never import or invoke this function in client components.
 */
export function getRazorpayClient(): Razorpay {
  if (!isRazorpayConfigured()) {
    throw new RazorpayConfigurationError(
      "Razorpay credentials are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server environment."
    );
  }

  if (!cachedRazorpayClient) {
    cachedRazorpayClient = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID as string,
      key_secret: process.env.RAZORPAY_KEY_SECRET as string,
    });
  }

  return cachedRazorpayClient;
}

/**
 * Resets the cached Razorpay client singleton (primarily for test environments).
 */
export function resetRazorpayClient(): void {
  cachedRazorpayClient = null;
}

/**
 * Returns safe, non-sensitive configuration status for diagnostic checks.
 * NEVER returns raw keys or secrets.
 */
export function getSafeRazorpayStatus(): {
  isConfigured: boolean;
  keyIdPrefix: string | null;
} {
  const configured = isRazorpayConfigured();
  if (!configured) {
    return {
      isConfigured: false,
      keyIdPrefix: null,
    };
  }

  const keyId = process.env.RAZORPAY_KEY_ID || "";
  // Show only the prefix (e.g. rzp_test_ or rzp_live_) without revealing the rest
  const prefixMatch = keyId.match(/^(rzp_(?:test|live)_[a-zA-Z0-9]{4})/);
  const keyIdPrefix = prefixMatch ? `${prefixMatch[1]}...` : "configured";

  return {
    isConfigured: true,
    keyIdPrefix,
  };
}
