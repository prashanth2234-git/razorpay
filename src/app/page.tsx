import Link from "next/link";
import { ArrowRight, ShieldCheck, GitBranch, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody } from "@/components/ui/panel";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-ink text-[13px] font-semibold leading-none text-paper">
              R
            </span>
            <span className="text-[14px] font-semibold text-ink">RazorRecover</span>
          </div>
          <nav className="hidden items-center gap-6 text-[13.5px] text-ink-muted sm:flex">
            <a href="#how-it-works" className="hover:text-ink">How it works</a>
            <a href="#architecture" className="hover:text-ink">Architecture</a>
            <a href="#security" className="hover:text-ink">Security</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">View demo</Button>
            </Link>
            <Link href="/dashboard">
              <Button size="sm">Open dashboard</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="max-w-2xl">
          <p className="mb-4 text-[13px] font-medium text-recovery">Razorpay AI Buildathon</p>
          <h1 className="text-[44px] font-semibold leading-[1.1] text-ink">
            Recover revenue before it&apos;s lost.
          </h1>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-muted">
            AI-powered payment recovery that diagnoses failures, predicts recovery
            opportunities, and intelligently orchestrates the next best action —
            with a human always in the loop.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link href="/dashboard">
              <Button size="lg">
                Open dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg">View demo</Button>
            </Link>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Panel>
            <PanelBody>
              <Gauge className="h-5 w-5 text-recovery" />
              <p className="mt-3 text-[14px] font-semibold text-ink">Detect &amp; diagnose</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                Every failure is classified into a normalized category with a
                confidence score, grounded in the actual payment context.
              </p>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelBody>
              <GitBranch className="h-5 w-5 text-ai" />
              <p className="mt-3 text-[14px] font-semibold text-ink">Decide &amp; act</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                A deterministic policy engine validates every AI recommendation
                before anything executes.
              </p>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelBody>
              <ShieldCheck className="h-5 w-5 text-info" />
              <p className="mt-3 text-[14px] font-semibold text-ink">Measure &amp; audit</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                Every decision, approval, and action is recorded — recovered
                revenue is always traceable to its cause.
              </p>
            </PanelBody>
          </Panel>
        </div>
      </section>
    </div>
  );
}
