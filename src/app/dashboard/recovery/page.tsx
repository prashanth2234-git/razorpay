import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelBody } from "@/components/ui/panel";

export default function Page() {
  return (
    <>
      <PageHeader title="Recovery" description="Recovery actions awaiting approval and in progress." />
      <Panel>
        <PanelBody className="flex flex-col items-center gap-1 py-16 text-center">
          <p className="text-[13.5px] font-medium text-ink">Coming in Milestone 6</p>
          <p className="text-[13px] text-ink-muted">This screen is scaffolded and will be built out next.</p>
        </PanelBody>
      </Panel>
    </>
  );
}
