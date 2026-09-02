import { PaymentAnalysisInput, AiPaymentAnalysisResult } from "./claude";

export type { PaymentAnalysisInput, AiPaymentAnalysisResult };

/**
 * Common abstraction for pluggable AI diagnosis providers (Claude, Gemini, etc.).
 */
export interface AiDiagnosisProvider {
  name: string;
  defaultModel: string;
  isConfigured(): boolean;
  analyze(
    input: PaymentAnalysisInput,
    options?: { model?: string }
  ): Promise<AiPaymentAnalysisResult>;
}
