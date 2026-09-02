import { GoogleGenAI } from "@google/genai";
import {
  AiDiagnosisResponse,
  AiDiagnosisResponseSchema,
  PaymentAnalysisInput,
  AiPaymentAnalysisResult,
} from "./claude";
import { AiDiagnosisProvider } from "./provider";

/**
 * Default Gemini model for structured payment failure diagnosis.
 * gemini-3.6-flash is the standard model for structured JSON output in @google/genai SDK.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

/**
 * Returns whether GEMINI_API_KEY is configured in the server environment.
 */
export function isGeminiConfigured(): boolean {
  return (
    typeof process.env.GEMINI_API_KEY === "string" &&
    process.env.GEMINI_API_KEY.trim().length > 0
  );
}

/**
 * Server-only singleton factory for GoogleGenAI client.
 * Returns null safely if GEMINI_API_KEY is not configured.
 */
export function getGeminiClient(): GoogleGenAI | null {
  if (!isGeminiConfigured()) {
    return null;
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

/**
 * Builds a strict structured prompt for Gemini payment failure analysis.
 */
export function buildGeminiAnalysisPrompt(input: PaymentAnalysisInput): string {
  const formattedAmount = (input.amount / 100).toFixed(2);
  const ltvFormatted = input.customerLifetimeValue
    ? (input.customerLifetimeValue / 100).toFixed(2)
    : "0.00";

  return `You are RazorRecover's AI Payment Recovery Diagnostic Engine.
Your task is to analyze a failed transaction, diagnose the root cause, estimate recovery probability, and recommend the best policy-compliant intervention.

IMPORTANT SAFETY CONSTRAINTS:
1. Your recommendation is strictly ADVISORY.
2. Do not attempt to execute or approve any payment.
3. You must respond with valid JSON ONLY matching the required schema. Do not include markdown code fences, backticks, or any conversational prose outside the JSON object.

=== TRANSACTION CONTEXT ===
- Payment ID: ${input.paymentId}
- Provider Reference: ${input.providerPaymentId || "N/A"}
- Amount: ₹${formattedAmount} ${input.currency}
- Payment Method: ${input.paymentMethod}
- Status: ${input.paymentStatus}
- Failure Category: ${input.failureCategory || "UNKNOWN"}
- Provider Error Code: ${input.failureCode || "N/A"}
- Provider Error Message: ${input.failureMessage || "N/A"}
- Prior Attempt Count: ${input.attemptCount || 1}

=== CUSTOMER CONTEXT ===
- Customer Name: ${input.customerName || "Anonymous"}
- Customer Lifetime Value (LTV): ₹${ltvFormatted}
- Historical Successful Payments: ${input.customerSuccessfulPaymentCount ?? 0}
- Historical Failed Payments: ${input.customerFailedPaymentCount ?? 0}

=== MERCHANT RECOVERY POLICIES ===
- Auto-Recovery Enabled: ${input.merchantAutoRecoveryEnabled ?? true}
- Confidence Threshold: ${Math.round((input.merchantConfidenceThreshold ?? 0.8) * 100)}%

=== REQUIRED JSON OUTPUT SCHEMA ===
Respond with a single JSON object containing EXACTLY these keys:
{
  "diagnosis": "Brief, technical diagnosis of why the payment failed",
  "confidence": <number between 0.00 and 1.00 indicating your confidence in the diagnosis>,
  "recoveryProbability": <number between 0.00 and 1.00 indicating likelihood of recovering this revenue>,
  "recommendedAction": <one of: "RETRY_PAYMENT" | "SEND_REMINDER" | "REQUEST_PAYMENT_METHOD_UPDATE" | "WAIT" | "ESCALATE">,
  "riskLevel": <one of: "LOW" | "MEDIUM" | "HIGH">,
  "reasoning": "Clear, concise explainability rationale for operations teams explaining why this action was selected"
}

Allowed recommendedAction values:
- RETRY_PAYMENT: For transient banking gateway/network timeouts where immediate or delayed automated retry is safe.
- SEND_REMINDER: For customer-actionable dropoffs like 3DS OTP expiry or low account balance where customer needs a prompt.
- REQUEST_PAYMENT_METHOD_UPDATE: For permanently invalid credentials like expired cards or deactivated VPAs.
- WAIT: For pending bank switch reconciliations.
- ESCALATE: For explicit customer checkout cancellations, fatal mandate declines, high-risk anomalies, or stopping rule breaches.`;
}

/**
 * Cleans and validates raw text from Gemini into the typed AiDiagnosisResponse.
 */
export function parseAndValidateGeminiResponse(
  rawText: string
): { success: true; data: AiDiagnosisResponse } | { success: false; error: string } {
  try {
    let cleanJson = rawText.trim();

    // Strip markdown code fences if present (```json ... ``` or ``` ...)
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }

    const parsed = JSON.parse(cleanJson);
    const validated = AiDiagnosisResponseSchema.safeParse(parsed);

    if (!validated.success) {
      const errorMsg = validated.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      return {
        success: false,
        error: `Gemini JSON failed schema validation: ${errorMsg}`,
      };
    }

    return {
      success: true,
      data: validated.data as AiDiagnosisResponse,
    };
  } catch (err) {
    const parseError =
      err instanceof Error ? err.message : "Unknown JSON parsing error";
    return {
      success: false,
      error: `Failed to parse Gemini response as JSON: ${parseError}`,
    };
  }
}

/**
 * Analyzes a payment failure using Google Gemini.
 * Returns a typed success result or controlled failure.
 */
export async function analyzePaymentWithGemini(
  input: PaymentAnalysisInput,
  options?: { model?: string }
): Promise<AiPaymentAnalysisResult> {
  const modelName = options?.model || DEFAULT_GEMINI_MODEL;

  if (!isGeminiConfigured()) {
    return {
      success: false,
      code: "MISSING_API_KEY",
      error: "Gemini API key is not configured in environment (GEMINI_API_KEY).",
      model: modelName,
    };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return {
      success: false,
      code: "MISSING_API_KEY",
      error: "Failed to initialize Gemini client: GEMINI_API_KEY is missing.",
      model: modelName,
    };
  }

  try {
    const prompt = buildGeminiAnalysisPrompt(input);

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 1024,
      },
    });

    const rawText = response.text;
    if (!rawText || rawText.trim().length === 0) {
      return {
        success: false,
        code: "PARSE_ERROR",
        error: "Gemini returned an empty response body.",
        model: modelName,
      };
    }

    const validationResult = parseAndValidateGeminiResponse(rawText);

    if (!validationResult.success) {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        error: validationResult.error,
        model: modelName,
      };
    }

    return {
      success: true,
      data: validationResult.data,
      model: modelName,
    };
  } catch (error) {
    console.error("Gemini AI analysis error:", error);
    const message =
      error instanceof Error ? error.message : "Unexpected Gemini API error";
    return {
      success: false,
      code: "API_ERROR",
      error: message,
      model: modelName,
    };
  }
}

/**
 * Standard AiDiagnosisProvider implementation for Gemini.
 */
export const geminiDiagnosisProvider: AiDiagnosisProvider = {
  name: "gemini",
  defaultModel: DEFAULT_GEMINI_MODEL,
  isConfigured: isGeminiConfigured,
  analyze: analyzePaymentWithGemini,
};
