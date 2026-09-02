import * as React from "react";
import { Bot, Sparkles, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";

export interface AiDiagnosisCardProps {
  diagnosis: string;
  confidence: number;
  recoveryProbability: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | string;
  recommendedAction: string;
  expectedRecoveryAmount?: number | null;
  reasoning: string;
  failureCategory?: string | null;
  modelName?: string;
  source?: "claude" | "seeded" | "deterministic_fallback";
  onAnalyzeWithAi?: () => void;
  isAnalyzing?: boolean;
  canAnalyze?: boolean;
  className?: string;
}

export function AiDiagnosisCard({
  diagnosis,
  confidence,
  recoveryProbability,
  riskLevel,
  recommendedAction,
  expectedRecoveryAmount,
  reasoning,
  failureCategory,
  modelName = "claude-3-7-sonnet",
  source = "seeded",
  onAnalyzeWithAi,
  isAnalyzing = false,
  canAnalyze = false,
  className = "",
}: AiDiagnosisCardProps) {
  const confidencePct = Math.round(confidence * 100);
  const recoveryPct = Math.round(recoveryProbability * 100);

  const actionTone =
    recommendedAction === "RETRY_PAYMENT"
      ? "recovery"
      : recommendedAction === "SEND_REMINDER"
      ? "ai"
      : recommendedAction === "REQUEST_PAYMENT_METHOD_UPDATE"
      ? "info"
      : "risk";

  const riskTone =
    riskLevel === "LOW" ? "recovery" : riskLevel === "MEDIUM" ? "risk" : "danger";

  const sourceBadgeTone = source === "claude" ? "ai" : "neutral";
  const sourceLabel =
    source === "claude"
      ? "Claude 3.7 Sonnet (Live)"
      : source === "deterministic_fallback"
      ? "Deterministic Engine"
      : "Baseline Analysis";

  return (
    <div
      className={`rounded-app border border-line bg-surface-raised p-5 shadow-xs ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line pb-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-ai-soft text-ai">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-[13.5px] font-semibold text-ink">AI Diagnosis</h4>
              <Badge tone={sourceBadgeTone} dot={source === "claude"}>
                {sourceLabel}
              </Badge>
            </div>
            <p className="text-[11.5px] text-ink-faint">Model: {modelName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {failureCategory && (
            <Badge tone="neutral">
              {failureCategory.replace(/_/g, " ")}
            </Badge>
          )}
          {canAnalyze && onAnalyzeWithAi && (
            <Button
              size="sm"
              variant="outline"
              disabled={isAnalyzing}
              onClick={onAnalyzeWithAi}
              className="h-7 gap-1 text-[12px]"
            >
              <RefreshCw
                className={`h-3 w-3 ${isAnalyzing ? "animate-spin text-ai" : ""}`}
              />
              {isAnalyzing ? "Analyzing…" : "Analyze with Claude"}
            </Button>
          )}
        </div>
      </div>

      {/* Metric Tiles Grid */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-app border border-line bg-surface p-3">
          <span className="text-[11.5px] text-ink-faint">Confidence</span>
          <p className="tabular mt-1 text-[17px] font-semibold text-ink">
            {confidencePct}%
          </p>
        </div>
        <div className="rounded-app border border-line bg-surface p-3">
          <span className="text-[11.5px] text-ink-faint">Recovery Odds</span>
          <p className="tabular mt-1 text-[17px] font-semibold text-recovery">
            {recoveryPct}%
          </p>
        </div>
        <div className="rounded-app border border-line bg-surface p-3">
          <span className="text-[11.5px] text-ink-faint">Risk Assessment</span>
          <div className="mt-1">
            <Badge tone={riskTone}>{riskLevel}</Badge>
          </div>
        </div>
        <div className="rounded-app border border-line bg-surface p-3">
          <span className="text-[11.5px] text-ink-faint">Expected Recovery</span>
          <p className="tabular mt-1 text-[17px] font-semibold text-ink">
            {expectedRecoveryAmount ? formatINR(expectedRecoveryAmount) : "—"}
          </p>
        </div>
      </div>

      {/* Recommended Action Box */}
      <div className="mt-3.5 rounded-app border border-line bg-surface p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ai" />
            <span className="text-[12.5px] font-medium text-ink">
              Recommended Intervention:
            </span>
          </div>
          <Badge tone={actionTone}>
            {recommendedAction.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      {/* Explainability Reasoning */}
      <div className="mt-3.5">
        <h5 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
          Why this action?
        </h5>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          {reasoning || diagnosis}
        </p>
      </div>
    </div>
  );
}
