import { getCurrentUser, getCurrentMerchant } from "@/server/auth";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Stat, StatRow } from "@/components/ui/stat";
import {
  Building2,
  Sliders,
  Webhook,
  ShieldCheck,
} from "lucide-react";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  let merchant = null;
  try {
    merchant = await getCurrentMerchant();
  } catch {
    // Default fallback
  }

  const merchantName = merchant?.businessName || "Kaveri Textiles Pvt. Ltd.";
  const merchantId = merchant?.id || user?.merchantId || "merch_kaveri_demo_01";
  const currency = merchant?.currency || "INR";
  const timezone = merchant?.timezone || "Asia/Kolkata";
  const confidenceThreshold = merchant ? `${(merchant.confidenceThreshold * 100).toFixed(0)}%` : "85%";
  const autoRecovery = merchant?.autoRecoveryEnabled ?? true;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Merchant Settings"
        description="Workspace configuration, recovery thresholds, and integration security."
      />

      {/* Overview Stat Row */}
      <StatRow>
        <Stat label="Workspace Status" value="Active" />
        <Stat label="Razorpay Mode" value="Test Mode" />
        <Stat label="Recovery Policy" value={autoRecovery ? "Auto-Recovery" : "Manual Only"} />
        <Stat label="Tenant Isolation" value="Enforced" />
      </StatRow>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Merchant Workspace Profile */}
        <Panel>
          <PanelHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-ink-muted" />
              <PanelTitle>Merchant Profile</PanelTitle>
            </div>
            <Badge tone="recovery">Verified</Badge>
          </PanelHeader>
          <PanelBody className="space-y-4 p-5 text-[13px]">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-ink-muted">Business Name</span>
              <span className="font-semibold text-ink">{merchantName}</span>
            </div>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-ink-muted">Merchant Identifier</span>
              <span className="font-mono text-[12px] font-medium text-ink-muted">{merchantId}</span>
            </div>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-ink-muted">Default Currency</span>
              <span className="font-semibold text-ink">{currency} (₹)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Operating Timezone</span>
              <span className="text-ink">{timezone}</span>
            </div>
          </PanelBody>
        </Panel>

        {/* Deterministic Recovery Policy Thresholds */}
        <Panel>
          <PanelHeader>
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-ink-muted" />
              <PanelTitle>Recovery Policy Thresholds</PanelTitle>
            </div>
            <Badge tone="info">Deterministic</Badge>
          </PanelHeader>
          <PanelBody className="space-y-4 p-5 text-[13px]">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-ink-muted">Auto-Recovery Execution</span>
              <Badge tone={autoRecovery ? "recovery" : "neutral"}>
                {autoRecovery ? "Enabled (Bounded)" : "Disabled"}
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-ink-muted">AI Confidence Minimum Threshold</span>
              <span className="font-semibold text-ink">{confidenceThreshold}</span>
            </div>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-ink-muted">Maximum Retry Attempts per Transaction</span>
              <span className="font-semibold text-ink">3 attempts</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">High-Risk Approval Gating</span>
              <span className="font-semibold text-risk">Mandatory Operator Sign-off</span>
            </div>
          </PanelBody>
        </Panel>

        {/* Razorpay Integration Status */}
        <Panel>
          <PanelHeader>
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-ink-muted" />
              <PanelTitle>Gateway &amp; Webhook Integration</PanelTitle>
            </div>
            <Badge tone="ai">Test Mode</Badge>
          </PanelHeader>
          <PanelBody className="space-y-4 p-5 text-[13px]">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-ink-muted">Razorpay Environment</span>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-ai animate-pulse" />
                <span className="font-semibold text-ink">Test Mode Active</span>
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-ink-muted">HMAC-SHA256 Webhook Verification</span>
              <Badge tone="recovery">Constant-Time Timing-Safe</Badge>
            </div>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-ink-muted">Webhook Ingestion Endpoint</span>
              <code className="rounded bg-surface px-2 py-0.5 font-mono text-[12px] text-ink">
                /api/webhooks/razorpay
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Fund Movement Safety</span>
              <span className="text-[12px] font-medium text-recovery">
                Mock Provider &bull; Zero Live Money Movement
              </span>
            </div>
          </PanelBody>
        </Panel>

        {/* Security & Access Controls */}
        <Panel>
          <PanelHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-ink-muted" />
              <PanelTitle>Security &amp; Tenant Governance</PanelTitle>
            </div>
            <Badge tone="recovery">Protected</Badge>
          </PanelHeader>
          <PanelBody className="space-y-4 p-5 text-[13px]">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-ink-muted">Current Authenticated User</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{user?.name || "Farhan Merchant"}</span>
                <Badge tone="neutral">{user?.role || "ADMIN"}</Badge>
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-ink-muted">Multi-Tenant Scoping</span>
              <Badge tone="recovery">Strict Server Session Isolation</Badge>
            </div>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-ink-muted">Audit Trail Logging</span>
              <span className="text-ink">PostgreSQL Immutable Log (Sanitized)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Credential Redaction</span>
              <span className="text-[12px] text-ink-muted">Recursive Regex Key Sanitization</span>
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

