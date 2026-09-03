import { getCurrentMerchant } from "@/server/auth";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Stat, StatRow } from "@/components/ui/stat";
import {
  Sparkles,
  ShieldCheck,
  Cpu,
  Lock,
  CheckCircle2,
  FileCheck,
  Scale,
} from "lucide-react";

export default async function AgentPage() {
  let merchant = null;
  try {
    merchant = await getCurrentMerchant();
  } catch {
    // Fallback defaults for display
  }

  const confidenceThreshold = merchant ? `${(merchant.confidenceThreshold * 100).toFixed(0)}%` : "85%";

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Recovery Agent"
        description="Advisory diagnostic engine, model orchestration, and deterministic governance guardrails."
      />

      {/* Core AI Role & Governance Banner */}
      <div className="rounded-app border border-line bg-surface-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-ink text-paper">
              <Sparkles className="h-5 w-5 text-ai" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-semibold text-ink">AI Operating Role: Advisory</h3>
                <Badge tone="ai" dot>
                  Safety Guardrails Active
                </Badge>
              </div>
              <p className="mt-1 text-[13px] text-ink-muted">
                AI generates non-binding diagnostics and recovery suggestions. Deterministic policy rules evaluate every action, and human operators sign off when required.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-ink-muted">
            <Scale className="h-4 w-4 text-ai" />
            <span>AI recommends &bull; Policy decides &bull; Humans approve</span>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <StatRow>
        <Stat label="AI Operating Role" value="Advisory" />
        <Stat label="Confidence Threshold" value={confidenceThreshold} />
        <Stat label="Policy Gate Authority" value="Deterministic" />
        <Stat label="Execution Sandbox" value="Test Mode" />
      </StatRow>

      {/* Multi-Stage Governance Architecture */}
      <Panel>
        <PanelHeader>
          <div className="flex items-center gap-2">
            <PanelTitle>Deterministic Recovery Architecture</PanelTitle>
            <Badge tone="neutral">6-Stage Pipeline</Badge>
          </div>
          <span className="text-[12px] text-ink-faint">Fail-safe execution flow</span>
        </PanelHeader>
        <PanelBody className="p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-app border border-line bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Stage 1</span>
                <Sparkles className="h-4 w-4 text-ai" />
              </div>
              <h4 className="mt-2 text-[13px] font-semibold text-ink">AI Diagnosis</h4>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                Triage failure codes and generate recommended action &amp; confidence.
              </p>
              <Badge tone="ai" className="mt-3">Advisory</Badge>
            </div>

            <div className="rounded-app border border-line bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Stage 2</span>
                <Scale className="h-4 w-4 text-info" />
              </div>
              <h4 className="mt-2 text-[13px] font-semibold text-ink">Policy Gate</h4>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                Authoritative rules validate action type, retry limits, and risk level.
              </p>
              <Badge tone="info" className="mt-3">Authoritative</Badge>
            </div>

            <div className="rounded-app border border-line bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Stage 3</span>
                <Lock className="h-4 w-4 text-ink-muted" />
              </div>
              <h4 className="mt-2 text-[13px] font-semibold text-ink">Permission Check</h4>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                Verifies merchant tenant scope and role authorization (Admin/Operator).
              </p>
              <Badge tone="neutral" className="mt-3">Enforced</Badge>
            </div>

            <div className="rounded-app border border-line bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Stage 4</span>
                <FileCheck className="h-4 w-4 text-risk" />
              </div>
              <h4 className="mt-2 text-[13px] font-semibold text-ink">Human Approval</h4>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                Mandatory operator review for high risk, low confidence, or large value.
              </p>
              <Badge tone="risk" className="mt-3">Gated</Badge>
            </div>

            <div className="rounded-app border border-line bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Stage 5</span>
                <Cpu className="h-4 w-4 text-recovery" />
              </div>
              <h4 className="mt-2 text-[13px] font-semibold text-ink">Bounded Executor</h4>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                Dispatches safe recovery attempts via sandbox mock provider.
              </p>
              <Badge tone="recovery" className="mt-3">Simulated</Badge>
            </div>

            <div className="rounded-app border border-line bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Stage 6</span>
                <ShieldCheck className="h-4 w-4 text-ink" />
              </div>
              <h4 className="mt-2 text-[13px] font-semibold text-ink">Audit Trail</h4>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                Immutable, sanitized event log persisted in PostgreSQL.
              </p>
              <Badge tone="neutral" className="mt-3">Immutable</Badge>
            </div>
          </div>
        </PanelBody>
      </Panel>

      {/* Model Orchestration & Safety Guardrails */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Model Providers */}
        <Panel>
          <PanelHeader>
            <PanelTitle>Diagnostic Engine Providers</PanelTitle>
            <Badge tone="ai">Multi-Provider</Badge>
          </PanelHeader>
          <PanelBody className="space-y-4 p-5">
            <div className="flex items-start justify-between rounded-app border border-line p-3.5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">Anthropic Claude 3.5 Sonnet</span>
                  <Badge tone="neutral">Available</Badge>
                </div>
                <p className="text-[12px] text-ink-muted">
                  Deep failure root-cause analysis, contextual customer LTV reasoning, and recovery recommendations.
                </p>
              </div>
            </div>

            <div className="flex items-start justify-between rounded-app border border-line p-3.5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">Google Gemini 1.5 Pro</span>
                  <Badge tone="neutral">Available</Badge>
                </div>
                <p className="text-[12px] text-ink-muted">
                  Fast structured diagnostic schema validation, failure classification, and retry strategy proposal.
                </p>
              </div>
            </div>

            <div className="flex items-start justify-between rounded-app border border-line bg-surface p-3.5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">Deterministic Fallback Engine (v1)</span>
                  <Badge tone="recovery">Active Baseline</Badge>
                </div>
                <p className="text-[12px] text-ink-muted">
                  Guarantees 100% webhook ingestion uptime with zero external AI service dependencies or token limits.
                </p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Safety & Policy Guardrails */}
        <Panel>
          <PanelHeader>
            <PanelTitle>Safety &amp; Compliance Guardrails</PanelTitle>
            <Badge tone="recovery">Enforced</Badge>
          </PanelHeader>
          <PanelBody className="space-y-3.5 p-5 text-[12.5px]">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-recovery shrink-0 mt-0.5" />
              <div>
                <strong className="text-ink">Zero Autonomous Financial Authority:</strong>
                <span className="text-ink-muted"> AI recommendations cannot directly trigger payment capture or fund transfers.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-recovery shrink-0 mt-0.5" />
              <div>
                <strong className="text-ink">Strict Policy Authority:</strong>
                <span className="text-ink-muted"> Deterministic policy rules override any non-conforming AI output.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-recovery shrink-0 mt-0.5" />
              <div>
                <strong className="text-ink">Confidence Gating:</strong>
                <span className="text-ink-muted"> Recommendations with &lt;{confidenceThreshold} confidence require manual sign-off.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-recovery shrink-0 mt-0.5" />
              <div>
                <strong className="text-ink">High-Risk Quarantine:</strong>
                <span className="text-ink-muted"> Transactions flagged as HIGH risk are automatically locked pending operator review.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-recovery shrink-0 mt-0.5" />
              <div>
                <strong className="text-ink">No Secret Exposure:</strong>
                <span className="text-ink-muted"> API credentials, webhook secrets, and customer PANs are never transmitted to LLM endpoints.</span>
              </div>
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

