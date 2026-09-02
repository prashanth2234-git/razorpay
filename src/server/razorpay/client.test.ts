import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isRazorpayConfigured,
  getRazorpayClient,
  resetRazorpayClient,
  getSafeRazorpayStatus,
  RazorpayConfigurationError,
} from "./client";

describe("Server-Side Razorpay API Client (Milestone 6 Step 6)", () => {
  const originalKeyId = process.env.RAZORPAY_KEY_ID;
  const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    resetRazorpayClient();
  });

  afterEach(() => {
    process.env.RAZORPAY_KEY_ID = originalKeyId;
    process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
    resetRazorpayClient();
  });

  it("detects when valid Razorpay credentials are fully configured", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_MockKey123456789";
    process.env.RAZORPAY_KEY_SECRET = "MockSecret987654321";

    expect(isRazorpayConfigured()).toBe(true);

    const client = getRazorpayClient();
    expect(client).toBeDefined();
    expect(typeof client.payments).toBe("object");
  });

  it("returns cached singleton instance on consecutive getRazorpayClient calls", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_MockKey123456789";
    process.env.RAZORPAY_KEY_SECRET = "MockSecret987654321";

    const client1 = getRazorpayClient();
    const client2 = getRazorpayClient();

    expect(client1).toBe(client2);
  });

  it("throws RazorpayConfigurationError when RAZORPAY_KEY_ID is missing", () => {
    delete process.env.RAZORPAY_KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = "MockSecret987654321";

    expect(isRazorpayConfigured()).toBe(false);
    expect(() => getRazorpayClient()).toThrow(RazorpayConfigurationError);
    expect(() => getRazorpayClient()).toThrow(/missing/i);
  });

  it("throws RazorpayConfigurationError when RAZORPAY_KEY_SECRET is missing", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_MockKey123456789";
    delete process.env.RAZORPAY_KEY_SECRET;

    expect(isRazorpayConfigured()).toBe(false);
    expect(() => getRazorpayClient()).toThrow(RazorpayConfigurationError);
    expect(() => getRazorpayClient()).toThrow(/missing/i);
  });

  it("handles empty / whitespace credentials safely as unconfigured", () => {
    process.env.RAZORPAY_KEY_ID = "   ";
    process.env.RAZORPAY_KEY_SECRET = "   ";

    expect(isRazorpayConfigured()).toBe(false);
    expect(() => getRazorpayClient()).toThrow(RazorpayConfigurationError);
  });

  it("never exposes secret in getSafeRazorpayStatus and masks key id safely", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_AbCd1234567890XyZ";
    process.env.RAZORPAY_KEY_SECRET = "SuperSecretKeyNeverExposeInLogsOrResponses";

    const status = getSafeRazorpayStatus();

    expect(status.isConfigured).toBe(true);
    expect(status.keyIdPrefix).toBe("rzp_test_AbCd...");

    // Critical secrecy verification: neither full keyId nor any part of keySecret is in status
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("SuperSecretKeyNeverExposeInLogsOrResponses");
    expect(serialized).not.toContain("1234567890XyZ");
  });

  it("returns unconfigured status cleanly when credentials are unset", () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    const status = getSafeRazorpayStatus();
    expect(status.isConfigured).toBe(false);
    expect(status.keyIdPrefix).toBeNull();
  });
});
