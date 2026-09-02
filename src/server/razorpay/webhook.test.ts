import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  verifyRazorpayWebhookSignature,
  computeRazorpayWebhookSignature,
  isRazorpayWebhookConfigured,
} from "./webhook";

describe("Razorpay Webhook Signature Verification (Milestone 6 Step 7A)", () => {
  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const testSecret = "sec_test_mock_webhook_secret_123456789";
  const samplePayload = JSON.stringify({
    entity: "event",
    account_id: "acc_test_123",
    event: "payment.failed",
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: "pay_test_failed_001",
          amount: 50000,
          currency: "INR",
          status: "failed",
          error_code: "BAD_REQUEST_ERROR",
          error_description: "Payment failed due to insufficient funds",
        },
      },
    },
    created_at: 1725280000,
  });

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = testSecret;
  });

  afterEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
  });

  it("returns true for a valid HMAC-SHA256 signature matching the raw payload", () => {
    const validSignature = computeRazorpayWebhookSignature(samplePayload, testSecret);
    const isValid = verifyRazorpayWebhookSignature(samplePayload, validSignature);

    expect(isValid).toBe(true);
  });

  it("returns false if the raw request body has been modified or tampered with", () => {
    const validSignature = computeRazorpayWebhookSignature(samplePayload, testSecret);
    const tamperedPayload = samplePayload.replace("pay_test_failed_001", "pay_test_failed_999");

    const isValid = verifyRazorpayWebhookSignature(tamperedPayload, validSignature);
    expect(isValid).toBe(false);
  });

  it("returns false if the signature string has been altered", () => {
    const validSignature = computeRazorpayWebhookSignature(samplePayload, testSecret);
    // Tamper with a single hex character
    const tamperedSignature =
      validSignature.substring(0, 10) +
      (validSignature[10] === "a" ? "b" : "a") +
      validSignature.substring(11);

    const isValid = verifyRazorpayWebhookSignature(samplePayload, tamperedSignature);
    expect(isValid).toBe(false);
  });

  it("returns false if the signature is missing or empty string", () => {
    expect(verifyRazorpayWebhookSignature(samplePayload, "")).toBe(false);
    expect(verifyRazorpayWebhookSignature(samplePayload, "   ")).toBe(false);
  });

  it("returns false if the raw body is empty string", () => {
    const signature = computeRazorpayWebhookSignature("", testSecret);
    expect(verifyRazorpayWebhookSignature("", signature)).toBe(false);
  });

  it("returns false if RAZORPAY_WEBHOOK_SECRET is not configured in environment", () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;

    const validSignature = computeRazorpayWebhookSignature(samplePayload, testSecret);
    const isValid = verifyRazorpayWebhookSignature(samplePayload, validSignature);

    expect(isValid).toBe(false);
  });

  it("allows passing custom secret for testing or multi-webhook routing", () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const customSecret = "sec_custom_route_secret_999";
    const signature = computeRazorpayWebhookSignature(samplePayload, customSecret);

    const isValid = verifyRazorpayWebhookSignature(samplePayload, signature, customSecret);
    expect(isValid).toBe(true);

    const isInvalid = verifyRazorpayWebhookSignature(samplePayload, signature, "wrong_secret");
    expect(isInvalid).toBe(false);
  });

  it("handles signatures of differing length without throwing errors", () => {
    expect(verifyRazorpayWebhookSignature(samplePayload, "short_invalid_sig")).toBe(false);
    expect(verifyRazorpayWebhookSignature(samplePayload, "a".repeat(128))).toBe(false);
  });

  it("correctly identifies whether webhook secret is configured", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "sec_configured_123";
    expect(isRazorpayWebhookConfigured()).toBe(true);

    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect(isRazorpayWebhookConfigured()).toBe(false);

    process.env.RAZORPAY_WEBHOOK_SECRET = "   ";
    expect(isRazorpayWebhookConfigured()).toBe(false);
  });
});
