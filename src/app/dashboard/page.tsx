import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Stat, StatRow } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Payment health and recovery performance across your workspace."
      />

      <StatRow>
        <Stat label="Total revenue" value="₹18,42,900" delta={4.1} />
        <Stat label="Revenue recovered" value="₹4,82,350" delta={18.4} />
        <Stat label="Recovery rate" value="68.4%" delta={7.2} />
        <Stat
          label="Failed payments"
          value="1,284"
          delta={-12.8}
          deltaGoodDirection="down"
        />
        <Stat label="AI interventions" value="937" delta={21.3} />
        <Stat label="Pending recoveries" value="146" delta={-3.5} deltaGoodDirection="down" />
      </StatRow>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader>
            <PanelTitle>Revenue recovered over time</PanelTitle>
          </PanelHeader>
          <PanelBody>
            <div className="flex h-64 items-center justify-center text-[13px] text-ink-faint">
              Chart wired up in Milestone 2 (real data)
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Failure reasons</PanelTitle>
          </PanelHeader>
          <PanelBody>
            <div className="flex h-64 items-center justify-center text-[13px] text-ink-faint">
              Chart wired up in Milestone 2
            </div>
          </PanelBody>
        </Panel>
      </div>

      <Panel className="mt-4">
        <PanelHeader>
          <PanelTitle>Recent AI decisions</PanelTitle>
          <Badge tone="ai" dot>
            Live
          </Badge>
        </PanelHeader>
        <PanelBody className="flex flex-col items-center gap-1 py-12 text-center">
          <p className="text-[13.5px] font-medium text-ink">
            Wired to real AI analyses in Milestone 5
          </p>
          <p className="text-[13px] text-ink-muted">
            Each decision will show diagnosis, confidence, and recommended action.
          </p>
        </PanelBody>
      </Panel>
    </>
  );
}
