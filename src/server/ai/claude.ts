import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  FailureCategory,
  PaymentMethod,
  PaymentStatus,
  RecoveryActionType,
} from "@prisma/client";
import { CATEGORY_ACTION_POLICY } from "@/server/recovery/policy";

/**
 * Default Claude model for financial failure diagnosis.
 */
export const DEFAULT_CLAUDE_MODEL = "claude-3-7-sonnet-20250219";

/**
 * Strict Zod schema for Claude AI diagnosis responses.
 */
export const AiDiagnosisResponseSchema = z.object({
  diagnosis: z.string().min(1, "Diagnosis must not be empty"),
  confidence: z
    .number()
    .min(0, "Confidence must be >= 0")
    .max(1, "Confidence must be <= 1"),
  recoveryProbability: z
    .number()
    .min(0, "Recovery probability must be >= 0")
    .max(1, "Recovery probability must be <= 1"),
  recommendedAction: z.enum([
    "RETRY_PAYMENT",
    "SEND_REMINDER",
    "REQUEST_PAYMENT_METHOD_UPDATE",
    "WAIT",
    "ESCALATE",
  ]),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  reasoning: z.string().min(1, "Reasoning must not be empty"),
});

export type AiDiagnosisResponse = z.infer<typeof AiDiagnosisResponseSchema>;

export interface PaymentAnalysisInput {
  paymentId?: string;
  providerPaymentId?: string | null;
  amount: number; // in paise
  currency: string;
  paymentMethod: PaymentMethod | string;
  paymentStatus: PaymentStatus | string;
  failureCategory?: FailureCategory | string | null;
  failureMessage?: string | null;
  failureCode?: string | null;
  attemptCount?: number;
  customerName?: string;
  customerLifetimeValue?: number; // in paise
  customerSuccessfulPaymentCount?: number;
  customerFailedPaymentCount?: number;
  merchantAutoRecoveryEnabled?: boolean;
  merchantConfidenceThreshold?: number;
}

export interface ClaudeAnalysisSuccess {
  success: true;
  data: AiDiagnosisResponse;
  model: string;
  rawResponse?: string;
}

export interface ClaudeAnalysisFailure {
  success: false;
  error: string;
  code: "MISSING_API_KEY" | "API_ERROR" | "PARSE_ERROR" | "VALIDATION_ERROR";
  model: string;
}

export type ClaudeAnalysisResult = ClaudeAnalysisSuccess | ClaudeAnalysisFailure;
export type AiPaymentAnalysisResult = ClaudeAnalysisResult;

let cachedClient: Anthropic | null = null;

/**
 * Checks whether the CLAUDE_API_KEY environment variable is configured on the server.
 */
export function isClaudeConfigured(): boolean {
  const key = process.env.CLAUDE_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

/**
 * Returns a singleton Anthropic client instance or null if unconfigured.
 */
export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new Anthropic({
      apiKey: apiKey.trim(),
    });
  }

  return cachedClient;
}

/**
 * Cleans and safely parses raw text from Claude into a validated AiDiagnosisResponse.
 */
export function parseAndValidateClaudeResponse(
  rawText: string
): { success: true; data: AiDiagnosisResponse } | { success: false; error: string } {
  if (!rawText || typeof rawText !== "string") {
    return { success: false, error: "Empty or invalid response received from Claude." };
  }

  let cleaned = rawText.trim();

  // Strip markdown code fences if present (e.g. ```json ... ```)
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseError) {
    return {
      success: false,
      error: `Failed to parse response as JSON: ${
        parseError instanceof Error ? parseError.message : String(parseError)
      }`,
    };
  }

  const result = AiDiagnosisResponseSchema.safeParse(parsed);
  if (!result.success) {
    const errorMessages = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    );
    return {
      success: false,
      error: `AI response schema validation failed: ${errorMessages.join("; ")}`,
    };
  }

  return { success: true, data: result.data };
}

/**
 * Builds the structured prompt for payment failure analysis.
 */
export function buildPaymentAnalysisPrompt(input: PaymentAnalysisInput): string {
  const amountRupees = (input.amount / 100).toFixed(2);
  const ltvRupees = ((input.customerLifetimeValue || 0) / 100).toFixed(2);

  return `You are a high-precision payment recovery intelligence agent for an Indian merchant running on Razorpay.
Analyze the following payment failure event and provide an actionable, bounded diagnosis.

TRANSACTION CONTEXT:
- Payment ID: ${input.providerPaymentId || input.paymentId || "N/A"}
- Amount: ₹${amountRupees} ${input.currency}
- Payment Method: ${input.paymentMethod}
- Status: ${input.paymentStatus}
- Failure Category: ${input.failureCategory || "UNKNOWN"}
- Gateway Response Code: ${input.failureCode || "N/A"}
- Gateway Error Message: ${input.failureMessage || "N/A"}
- Previous Attempt Count: ${input.attemptCount || 1}

CUSTOMER CONTEXT:
- Customer: ${input.customerName || "Customer"}
- Lifetime Value (LTV): ₹${ltvRupees}
- Historical Successful Payments: ${input.customerSuccessfulPaymentCount || 0}
- Historical Failed Payments: ${input.customerFailedPaymentCount || 0}

MERCHANT POLICY CONTEXT:
- Auto-Recovery Enabled: ${input.merchantAutoRecoveryEnabled !== false}
- Confidence Threshold: ${((input.merchantConfidenceThreshold || 0.8) * 100).toFixed(0)}%

ALLOWED ACTIONS:
- "RETRY_PAYMENT": Transient issuer/network failure with high probability of immediate or scheduled success.
- "SEND_REMINDER": Soft failure (insufficient funds, auth drop) requiring customer notification with smart payment link.
- "REQUEST_PAYMENT_METHOD_UPDATE": Method hard failure (expired card, invalid VPA) requiring updated credentials.
- "WAIT": Cooldown period before re-evaluating.
- "ESCALATE": Repeated failure, mandate defect, customer cancellation, or high-risk transaction requiring human operator review.

RESPONSE INSTRUCTIONS:
Return ONLY a valid, raw JSON object matching this schema. Do not include markdown formatting, code fences, or any other text.

JSON Schema:
{
  "diagnosis": "Short technical diagnosis of why the transaction failed",
  "confidence": <number between 0.0 and 1.0>,
  "recoveryProbability": <number between 0.0 and 1.0>,
  "recommendedAction": "RETRY_PAYMENT" | "SEND_REMINDER" | "REQUEST_PAYMENT_METHOD_UPDATE" | "WAIT" | "ESCALATE",
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "reasoning": "Detailed 2-3 sentence explainability text stating why this specific action was chosen based on failure pattern and customer history."
}`;
}

/**
 * Analyzes a payment failure with Claude AI and validates the output strictly against the schema.
 * Note: This function is advisory only and never executes database writes or financial operations.
 */
export async function analyzePaymentWithClaude(
  input: PaymentAnalysisInput,
  options?: { model?: string }
): Promise<ClaudeAnalysisResult> {
  const model = options?.model || DEFAULT_CLAUDE_MODEL;

  if (!isClaudeConfigured()) {
    return {
      success: false,
      code: "MISSING_API_KEY",
      error: "Claude API key is not configured in environment (CLAUDE_API_KEY).",
      model,
    };
  }

  const client = getAnthropicClient();
  if (!client) {
    return {
      success: false,
      code: "MISSING_API_KEY",
      error: "Unable to initialize Anthropic client.",
      model,
    };
  }

  const prompt = buildPaymentAnalysisPrompt(input);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract text content from Anthropic response block
    const textBlock = response.content.find((block) => block.type === "text");
    const rawText = textBlock ? textBlock.text : "";

    if (!rawText) {
      return {
        success: false,
        code: "API_ERROR",
        error: "Anthropic API returned an empty text content block.",
        model,
      };
    }

    const validation = parseAndValidateClaudeResponse(rawText);
    if (!validation.success) {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        error: validation.error,
        model,
      };
    }

    return {
      success: true,
      data: validation.data,
      model,
      rawResponse: rawText,
    };
  } catch (apiError) {
    const errorMessage =
      apiError instanceof Error ? apiError.message : "Unknown Anthropic API error";
    return {
      success: false,
      code: "API_ERROR",
      error: errorMessage,
      model,
    };
  }
}

/**
 * Generates a deterministic fallback diagnosis using bounded category rules from the recovery policy.
 */
export function createDeterministicDiagnosis(
  input: PaymentAnalysisInput
): AiDiagnosisResponse {
  const cat = (input.failureCategory as FailureCategory) || FailureCategory.UNKNOWN;
  const attempts = input.attemptCount || 1;
  const successCount = input.customerSuccessfulPaymentCount || 0;

  // Derive permitted action from policy mapping
  const permittedActions = CATEGORY_ACTION_POLICY[cat] || [RecoveryActionType.ESCALATE];
  let recommendedAction: AiDiagnosisResponse["recommendedAction"] =
    permittedActions[0] as AiDiagnosisResponse["recommendedAction"];

  let diagnosis = "Transaction failed due to an unclassified error.";
  let confidence = 0.85;
  let recoveryProbability = 0.50;
  let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
  let reasoning = "The payment failed and requires review.";

  switch (cat) {
    case FailureCategory.TEMPORARY_ISSUER_FAILURE:
      diagnosis = "Temporary issuer or bank gateway connection dropped during authorization.";
      confidence = 0.94;
      recoveryProbability = 0.88;
      riskLevel = "LOW";
      recommendedAction = "RETRY_PAYMENT";
      reasoning = `The failure pattern indicates a temporary banking system downtime. The customer has ${successCount} previous successful transactions, indicating strong payment intent for an automated retry.`;
      break;

    case FailureCategory.NETWORK_TIMEOUT:
      diagnosis = "Network latency exceeded gateway timeout threshold before acknowledgement.";
      confidence = 0.96;
      recoveryProbability = 0.92;
      riskLevel = "LOW";
      recommendedAction = "RETRY_PAYMENT";
      reasoning = "Network timeout occurred while communicating with provider switch. The session is safe to retry automatically.";
      break;

    case FailureCategory.INSUFFICIENT_FUNDS:
      diagnosis = "Cardholder or VPA account has insufficient balance to complete capture.";
      confidence = 0.90;
      recoveryProbability = 0.65;
      riskLevel = "MEDIUM";
      recommendedAction = "SEND_REMINDER";
      reasoning = "Balance deficiency identified. Sending an intelligent payment link reminder gives the customer time to top up and complete payment.";
      break;

    case FailureCategory.AUTHENTICATION_FAILURE:
      diagnosis = "Customer failed 3D Secure OTP verification or biometric challenge.";
      confidence = 0.88;
      recoveryProbability = 0.70;
      riskLevel = "LOW";
      recommendedAction = "SEND_REMINDER";
      reasoning = "OTP timed out or was misentered. Dispatching a refreshed payment link allows the customer to re-authenticate cleanly.";
      break;

    case FailureCategory.EXPIRED_CARD:
      diagnosis = "The customer card on file has passed its expiry date.";
      confidence = 0.98;
      recoveryProbability = 0.75;
      riskLevel = "LOW";
      recommendedAction = "REQUEST_PAYMENT_METHOD_UPDATE";
      reasoning = "Card credentials are permanently expired. Requesting updated card or UPI VPA credentials from the customer is necessary.";
      break;

    case FailureCategory.INVALID_PAYMENT_METHOD:
      diagnosis = "The provided UPI VPA or payment token was rejected as invalid by provider.";
      confidence = 0.95;
      recoveryProbability = 0.60;
      riskLevel = "MEDIUM";
      recommendedAction = "REQUEST_PAYMENT_METHOD_UPDATE";
      reasoning = "Payment method identifier is invalid or inactive. A method update link should be shared with the customer.";
      break;

    case FailureCategory.CUSTOMER_CANCELLED:
      diagnosis = "The customer explicitly aborted the payment checkout flow.";
      confidence = 0.92;
      recoveryProbability = 0.35;
      riskLevel = "HIGH";
      recommendedAction = "ESCALATE";
      reasoning = "Customer deliberately dismissed the payment modal. Automated retries should not occur; escalate to merchant sales/support.";
      break;

    case FailureCategory.MANDATE_FAILURE:
      diagnosis = "Standing recurring auto-debit mandate was rejected by beneficiary bank.";
      confidence = 0.90;
      recoveryProbability = 0.40;
      riskLevel = "HIGH";
      recommendedAction = "ESCALATE";
      reasoning = "Recurring mandate instruction failed execution. Requires customer re-registration of mandate.";
      break;

    default:
      diagnosis = "Unrecognized gateway failure code requiring manual inspection.";
      confidence = 0.75;
      recoveryProbability = 0.30;
      riskLevel = "HIGH";
      recommendedAction = "ESCALATE";
      reasoning = "Unknown failure response from provider. Escalate to operator to avoid unintended duplicate charges.";
      break;
  }

  // Stopping rule adjustment for repeated attempts
  if (attempts >= 3) {
    recommendedAction = "ESCALATE";
    riskLevel = "HIGH";
    recoveryProbability = Math.max(0.1, recoveryProbability - 0.4);
    reasoning = `After ${attempts} prior unsuccessful attempts, automated interventions are halted by policy. Escalated to manual operator review.`;
  }

  return {
    diagnosis,
    confidence,
    recoveryProbability: Math.round(recoveryProbability * 100) / 100,
    recommendedAction,
    riskLevel,
    reasoning,
  };
}
