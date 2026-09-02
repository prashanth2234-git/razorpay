import { describe, it, expect, afterEach } from "vitest";
import { FailureCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import {
  parseAndValidateGeminiResponse,
  buildGeminiAnalysisPrompt,
  analyzePaymentWithGemini,
  isGeminiConfigured,
  DEFAULT_GEMINI_MODEL,
} from "./gemini";

describe("Google Gemini AI Response Schema & Parser (Milestone 5 Step 11)", () => {
  it("successfully parses valid raw JSON output from Gemini", () => {
    const validRaw = JSON.stringify({
      diagnosis: "Temporary issuer failure due to timeout at acquiring bank switch.",
      confidence: 0.94,
      recoveryProbability: 0.87,
      recommendedAction: "RETRY_PAYMENT",
      riskLevel: "LOW",
      reasoning: "The customer has 6 successful prior payments and the error is transient.",
    });

    const result = parseAndValidateGeminiResponse(validRaw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendedAction).toBe("RETRY_PAYMENT");
      expect(result.data.confidence).toBe(0.94);
      expect(result.data.riskLevel).toBe("LOW");
    }
  });

  it("safely strips markdown code fences before parsing Gemini output", () => {
    const markdownWrapped = "```json\n" + JSON.stringify({
      diagnosis: "Expired card credentials on file.",
      confidence: 0.98,
      recoveryProbability: 0.72,
      recommendedAction: "REQUEST_PAYMENT_METHOD_UPDATE",
      riskLevel: "LOW",
      reasoning: "Card expired last month. Customer needs to enter new expiry date or card number.",
    }) + "\n```";

    const result = parseAndValidateGeminiResponse(markdownWrapped);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendedAction).toBe("REQUEST_PAYMENT_METHOD_UPDATE");
    }
  });

  it("fails gracefully on malformed JSON syntax from Gemini", () => {
    const malformed = "{ diagnosis: 'Broken JSON without quotes', confidence: 0.9 ";
    const result = parseAndValidateGeminiResponse(malformed);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Failed to parse Gemini response as JSON");
    }
  });

  it("fails schema validation when confidence is out of [0, 1] range", () => {
    const invalidConfidence = JSON.stringify({
      diagnosis: "Transient network failure.",
      confidence: 1.5,
      recoveryProbability: 0.85,
      recommendedAction: "RETRY_PAYMENT",
      riskLevel: "LOW",
      reasoning: "High probability retry.",
    });

    const result = parseAndValidateGeminiResponse(invalidConfidence);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("confidence");
    }
  });

  it("fails schema validation on unsupported recommended action", () => {
    const invalidAction = JSON.stringify({
      diagnosis: "Transient failure.",
      confidence: 0.90,
      recoveryProbability: 0.80,
      recommendedAction: "REFUND_CUSTOMER",
      riskLevel: "LOW",
      reasoning: "Invalid action type.",
    });

    const result = parseAndValidateGeminiResponse(invalidAction);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("recommendedAction");
    }
  });
});

describe("Gemini Payment Analysis Prompt Builder", () => {
  it("formats structured prompt containing transaction and customer context", () => {
    const prompt = buildGeminiAnalysisPrompt({
      paymentId: "pay_test_gemini_123",
      amount: 499900,
      currency: "INR",
      paymentMethod: PaymentMethod.UPI,
      paymentStatus: PaymentStatus.FAILED,
      failureCategory: FailureCategory.INSUFFICIENT_FUNDS,
      failureMessage: "Transaction declined by customer bank due to low balance",
      attemptCount: 1,
      customerName: "Radha Krishna",
      customerLifetimeValue: 1500000,
      customerSuccessfulPaymentCount: 4,
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.8,
    });

    expect(prompt).toContain("₹4999.00 INR");
    expect(prompt).toContain("INSUFFICIENT_FUNDS");
    expect(prompt).toContain("Radha Krishna");
    expect(prompt).toContain("₹15000.00");
    expect(prompt).toContain("80%");
    expect(prompt).toContain("REQUIRED JSON OUTPUT SCHEMA");
  });
});

describe("Gemini Client & Controlled Failures", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalKey;
  });

  it("returns controlled failure when GEMINI_API_KEY is unset", async () => {
    delete process.env.GEMINI_API_KEY;
    expect(isGeminiConfigured()).toBe(false);

    const result = await analyzePaymentWithGemini({
      amount: 100000,
      currency: "INR",
      paymentMethod: PaymentMethod.CARD,
      paymentStatus: PaymentStatus.FAILED,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("MISSING_API_KEY");
      expect(result.error).toContain("GEMINI_API_KEY");
    }
  });

  it("exposes default Gemini model constant", () => {
    expect(DEFAULT_GEMINI_MODEL).toBeDefined();
    expect(typeof DEFAULT_GEMINI_MODEL).toBe("string");
  });
});
