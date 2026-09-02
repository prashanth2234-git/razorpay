"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail, ArrowRight, Shield, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Please provide both email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Invalid credentials. Please verify your email and password.");
        setLoading(false);
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred during sign in. Please try again.");
      setLoading(false);
    }
  }

  function handleQuickFill(demoEmail: string, demoPass: string) {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  }

  return (
    <Panel className="border-line-strong shadow-sm">
      <PanelHeader>
        <PanelTitle>Merchant Portal Login</PanelTitle>
        <Badge tone="ai" dot>
          Secure
        </Badge>
      </PanelHeader>
      <PanelBody>
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-app border border-danger/30 bg-danger-soft p-3 text-[13px] text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12.5px] font-medium text-ink">
              Work Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input
                type="email"
                required
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12.5px] font-medium text-ink">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
                disabled={loading}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full justify-center"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in to Workspace"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        {/* Quick Demo Accounts */}
        <div className="mt-6 border-t border-line pt-4">
          <p className="mb-2.5 text-[11.5px] font-medium uppercase tracking-wider text-ink-faint">
            Quick Demo Logins (Local / Dev Mode)
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleQuickFill("farhan@kaveritextiles.com", "admin123")}
              className="flex flex-col items-center rounded-app border border-line bg-surface p-2 text-center transition-colors hover:border-line-strong hover:bg-surface-raised"
            >
              <span className="text-[12px] font-semibold text-ink">Admin</span>
              <span className="text-[10px] text-ink-faint">Full Access</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill("priyanka@kaveritextiles.com", "operator123")}
              className="flex flex-col items-center rounded-app border border-line bg-surface p-2 text-center transition-colors hover:border-line-strong hover:bg-surface-raised"
            >
              <span className="text-[12px] font-semibold text-ink">Operator</span>
              <span className="text-[10px] text-ink-faint">Actions &amp; Queue</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill("sunita@kaveritextiles.com", "viewer123")}
              className="flex flex-col items-center rounded-app border border-line bg-surface p-2 text-center transition-colors hover:border-line-strong hover:bg-surface-raised"
            >
              <span className="text-[12px] font-semibold text-ink">Viewer</span>
              <span className="text-[10px] text-ink-faint">Read-only</span>
            </button>
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Header Branding */}
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-[6px] bg-ink text-[16px] font-semibold text-paper">
            R
          </div>
          <h1 className="text-[22px] font-semibold text-ink">Sign in to RazorRecover</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            AI-powered autonomous payment recovery platform
          </p>
        </div>

        {/* Suspense boundary for useSearchParams */}
        <React.Suspense
          fallback={
            <Panel className="p-8 text-center text-ink-faint">
              Loading workspace login…
            </Panel>
          }
        >
          <LoginForm />
        </React.Suspense>

        {/* Footer Security Notice */}
        <div className="flex items-center justify-center gap-1.5 text-[12px] text-ink-faint">
          <Shield className="h-3.5 w-3.5" />
          <span>Protected by Auth.js and bcrypt encryption</span>
        </div>
      </div>
    </div>
  );
}
