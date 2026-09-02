import { describe, it, expect, afterEach } from "vitest";
import { FailureCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import {
  parseAndValidateClaudeResponse,
  buildPaymentAnalysisPrompt,
  createDeterministicDiagnosis,
  analyzePaymentWithClaude,
  isClaudeConfigured,
  DEFAULT_CLAUDE_MODEL,
} from "./claude";

describe("Claude AI Response Schema & Parser", () => {
  it("successfully parses valid raw JSON output", () => {
    const validRaw = JSON.stringify({
      diagnosis: "Temporary issuer failure due to timeout at acquiring bank switch.",
      confidence: 0.94,
      recoveryProbability: 0.87,
      recommendedAction: "RETRY_PAYMENT",
      riskLevel: "LOW",
      reasoning: "The customer has 6 successful prior payments and the error is transient.",
    });

    const result = parseAndValidateClaudeResponse(validRaw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendedAction).toBe("RETRY_PAYMENT");
      expect(result.data.confidence).toBe(0.94);
      expect(result.data.riskLevel).toBe("LOW");
    }
  });

  it("safely strips markdown code fences before parsing", () => {
    const markdownWrapped = "```json\n" + JSON.stringify({
      diagnosis: "Expired card credentials on file.",
      confidence: 0.98,
      recoveryProbability: 0.72,
      recommendedAction: "REQUEST_PAYMENT_METHOD_UPDATE",
      riskLevel: "LOW",
      reasoning: "Card expired last month. Customer needs to enter new expiry date or card number.",
    }) + "\n```";

    const result = parseAndValidateClaudeResponse(markdownWrapped);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendedAction).toBe("REQUEST_PAYMENT_METHOD_UPDATE");
    }
  });

  it("fails gracefully on malformed JSON syntax", () => {
    const malformed = "{ diagnosis: 'Broken JSON without quotes', confidence: 0.9 ";
    const result = parseAndValidateClaudeResponse(malformed);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Failed to parse response as JSON");
    }
  });

  it("fails schema validation when confidence is out of [0, 1] range", () => {
    const invalidConfidence = JSON.stringify({
      diagnosis: "Transient network failure.",
      confidence: 95, // should be 0.95, not 95
      recoveryProbability: 0.85,
      recommendedAction: "RETRY_PAYMENT",
      riskLevel: "LOW",
      reasoning: "High probability retry.",
    });

    const result = parseAndValidateClaudeResponse(invalidConfidence);
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
      recommendedAction: "AUTO_CHARGE_OTHER_CARD", // invalid enum
      riskLevel: "LOW",
      reasoning: "Invalid action type.",
    });

    const result = parseAndValidateClaudeResponse(invalidAction);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("recommendedAction");
    }
  });

  it("fails schema validation on empty reasoning", () => {
    const emptyReasoning = JSON.stringify({
      diagnosis: "Transient failure.",
      confidence: 0.90,
      recoveryProbability: 0.80,
      recommendedAction: "RETRY_PAYMENT",
      riskLevel: "LOW",
      reasoning: "",
    });

    const result = parseAndValidateClaudeResponse(emptyReasoning);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("reasoning");
    }
  });
});

describe("Payment Analysis Prompt Builder", () => {
  it("formats structured prompt containing transaction and customer context", () => {
    const prompt = buildPaymentAnalysisPrompt({
      paymentId: "pay_test_123",
      amount: 499900,
      currency: "INR",
      paymentMethod: PaymentMethod.UPI,
      paymentStatus: PaymentStatus.FAILED,
      failureCategory: FailureCategory.INSUFFICIENT_FUNDS,
      failureMessage: "Transaction declined by customer bank due to low balance",
      attemptCount: 1,
      customerName: "Pooja Hegde",
      customerLifetimeValue: 1500000,
      customerSuccessfulPaymentCount: 4,
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.8,
    });

    expect(prompt).toContain("₹4999.00 INR");
    expect(prompt).toContain("INSUFFICIENT_FUNDS");
    expect(prompt).toContain("Pooja Hegde");
    expect(prompt).toContain("₹15000.00");
    expect(prompt).toContain("80%");
    expect(prompt).toContain("JSON Schema:");
  });
});

describe("Deterministic Fallback Diagnosis", () => {
  it("handles temporary issuer failure with high confidence and retry action", () => {
    const fallback = createDeterministicDiagnosis({
      amount: 250000,
      currency: "INR",
      paymentMethod: PaymentMethod.UPI,
      paymentStatus: PaymentStatus.FAILED,
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      customerSuccessfulPaymentCount: 5,
    });

    expect(fallback.recommendedAction).toBe("RETRY_PAYMENT");
    expect(fallback.riskLevel).toBe("LOW");
    expect(fallback.confidence).toBeGreaterThanOrEqual(0.9);
    expect(fallback.recoveryProbability).toBeGreaterThanOrEqual(0.8);
    expect(fallback.reasoning).toContain("temporary banking system downtime");
  });

  it("handles expired card with payment method update action", () => {
    const fallback = createDeterministicDiagnosis({
      amount: 199900,
      currency: "INR",
      paymentMethod: PaymentMethod.CARD,
      paymentStatus: PaymentStatus.FAILED,
      failureCategory: FailureCategory.EXPIRED_CARD,
    });

    expect(fallback.recommendedAction).toBe("REQUEST_PAYMENT_METHOD_UPDATE");
    expect(fallback.riskLevel).toBe("LOW");
    expect(fallback.reasoning).toContain("Card credentials are permanently expired");
  });

  it("handles customer cancellation by escalating to human review", () => {
    const fallback = createDeterministicDiagnosis({
      amount: 500000,
      currency: "INR",
      paymentMethod: PaymentMethod.CARD,
      paymentStatus: PaymentStatus.FAILED,
      failureCategory: FailureCategory.CUSTOMER_CANCELLED,
    });

    expect(fallback.recommendedAction).toBe("ESCALATE");
    expect(fallback.riskLevel).toBe("HIGH");
    expect(fallback.recoveryProbability).toBeLessThan(0.5);
  });

  it("enforces safety stopping rule on 3 or more attempts", () => {
    const fallback = createDeterministicDiagnosis({
      amount: 500000,
      currency: "INR",
      paymentMethod: PaymentMethod.CARD,
      paymentStatus: PaymentStatus.FAILED,
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      attemptCount: 3,
    });

    expect(fallback.recommendedAction).toBe("ESCALATE");
    expect(fallback.riskLevel).toBe("HIGH");
    expect(fallback.reasoning).toContain("automated interventions are halted by policy");
  });
});

describe("Claude AI Client & Controlled Failures", () => {
  const originalKey = process.env.CLAUDE_API_KEY;

  afterEach(() => {
    process.env.CLAUDE_API_KEY = originalKey;
  });

  it("returns controlled failure when CLAUDE_API_KEY is unset", async () => {
    delete process.env.CLAUDE_API_KEY;
    expect(isClaudeConfigured()).toBe(false);

    const result = await analyzePaymentWithClaude({
      amount: 100000,
      currency: "INR",
      paymentMethod: PaymentMethod.CARD,
      paymentStatus: PaymentStatus.FAILED,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("MISSING_API_KEY");
      expect(result.error).toContain("CLAUDE_API_KEY");
    }
  });

  it("exposes default Claude model constant", () => {
    expect(DEFAULT_CLAUDE_MODEL).toBeDefined();
    expect(typeof DEFAULT_CLAUDE_MODEL).toBe("string");
  });
});
