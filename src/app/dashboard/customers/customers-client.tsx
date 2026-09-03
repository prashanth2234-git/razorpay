"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Search, Users, ArrowLeft, ArrowRight } from "lucide-react";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stat, StatRow } from "@/components/ui/stat";
import { formatINR, formatDateTime } from "@/lib/utils";
import { CustomersResponse } from "@/types/client";

interface CustomersClientProps {
  initialData: CustomersResponse;
}

export function CustomersClient({ initialData }: CustomersClientProps) {
  const searchParams = useSearchParams();

  const [data, setData] = React.useState<CustomersResponse>(initialData);
  const [search, setSearch] = React.useState(searchParams?.get("search") || "");
  const [hasFailures, setHasFailures] = React.useState(searchParams?.get("hasFailures") === "true");
  const [loading, setLoading] = React.useState(false);

  const totalLtvPaise = React.useMemo(() => {
    return data.customers.reduce((sum, c) => sum + (c.lifetimeValue || 0), 0);
  }, [data.customers]);

  const customersWithFailuresCount = React.useMemo(() => {
    return data.customers.filter((c) => c.failedPaymentCount > 0).length;
  }, [data.customers]);

  const loadCustomers = React.useCallback(
    async (targetPage: number, targetSearch: string, targetFailures: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", targetPage.toString());
        params.set("pageSize", "15");
        if (targetSearch.trim()) params.set("search", targetSearch.trim());
        if (targetFailures) params.set("hasFailures", "true");

        const res = await fetch(`/api/customers?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to load customers:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadCustomers(1, search, hasFailures);
  }

  function handlePageChange(newPage: number) {
    loadCustomers(newPage, search, hasFailures);
  }

  function handleToggleFailures() {
    const nextVal = !hasFailures;
    setHasFailures(nextVal);
    loadCustomers(1, search, nextVal);
  }

  function handleClearFilters() {
    setSearch("");
    setHasFailures(false);
    loadCustomers(1, "", false);
  }

  return (
    <div className="space-y-6">
      {/* KPI Overview */}
      <StatRow>
        <Stat
          label="Total Customers"
          value={data.total.toLocaleString("en-IN")}
        />
        <Stat
          label="Page Customer LTV"
          value={formatINR(totalLtvPaise)}
        />
        <Stat
          label="Customers with Failures"
          value={customersWithFailuresCount.toLocaleString("en-IN")}
          delta={hasFailures ? undefined : customersWithFailuresCount > 0 ? customersWithFailuresCount : 0}
          deltaGoodDirection="down"
        />
      </StatRow>

      {/* Filter & Search Bar */}
      <Panel>
        <PanelBody className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-3">
              <div className="relative min-w-[240px] max-w-sm flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <Input
                  type="text"
                  placeholder="Search by name, email, or phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 text-[13px]"
                />
              </div>
              <Button type="submit" variant="outline" size="sm" disabled={loading}>
                Search
              </Button>
              <button
                type="button"
                onClick={handleToggleFailures}
                className={`rounded-app border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  hasFailures
                    ? "border-risk bg-risk-soft text-risk"
                    : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                {hasFailures ? "✓ Filter: With Failures" : "Filter by Failures"}
              </button>
            </div>

            {(search || hasFailures) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-[12.5px] font-medium text-ink-muted underline hover:text-ink"
              >
                Clear filters
              </button>
            )}
          </form>
        </PanelBody>
      </Panel>

      {/* Customers Table */}
      <Panel>
        <PanelHeader>
          <div className="flex items-center gap-2">
            <PanelTitle>Customer Directory</PanelTitle>
            <Badge tone="neutral">{data.total} total</Badge>
          </div>
          <span className="text-[12px] text-ink-faint">
            Page {data.page} of {Math.max(1, data.totalPages)}
          </span>
        </PanelHeader>

        <PanelBody className="p-0">
          {data.customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-ink-muted">
              <Users className="h-8 w-8 text-ink-faint" />
              <p className="mt-2 text-[13.5px] font-medium text-ink">No customers match your criteria</p>
              <p className="text-[12.5px] text-ink-muted">Try adjusting search query or clearing active filters.</p>
              {(search || hasFailures) && (
                <Button variant="outline" size="sm" onClick={handleClearFilters} className="mt-4">
                  Reset filters
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH>Contact</TH>
                  <TH>Lifetime Value</TH>
                  <TH>Successful</TH>
                  <TH>Failed</TH>
                  <TH>Payment Health</TH>
                  <TH>First Seen</TH>
                </TR>
              </THead>
              <TBody>
                {data.customers.map((c) => {
                  const isHealthy = c.failedPaymentCount === 0;

                  return (
                    <TR key={c.id}>
                      <TD>
                        <div className="flex flex-col">
                          <span className="font-semibold text-ink">{c.name}</span>
                          <span className="text-[11.5px] text-ink-faint">{c.email}</span>
                        </div>
                      </TD>
                      <TD className="text-[12.5px] text-ink-muted">
                        {c.phone || "—"}
                      </TD>
                      <TD className="tabular font-semibold text-ink">
                        {formatINR(c.lifetimeValue)}
                      </TD>
                      <TD className="tabular">
                        <span className="font-medium text-recovery">{c.successfulPaymentCount}</span>
                      </TD>
                      <TD className="tabular">
                        <span className={`font-medium ${c.failedPaymentCount > 0 ? "text-danger" : "text-ink-muted"}`}>
                          {c.failedPaymentCount}
                        </span>
                      </TD>
                      <TD>
                        {isHealthy ? (
                          <Badge tone="recovery">Healthy</Badge>
                        ) : c.failedPaymentCount > 2 ? (
                          <Badge tone="danger">High Failures</Badge>
                        ) : (
                          <Badge tone="risk">Attention Needed</Badge>
                        )}
                      </TD>
                      <TD className="text-[12px] text-ink-muted">
                        {formatDateTime(c.createdAt)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </PanelBody>
      </Panel>

      {/* Pagination Controls */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-line pt-4">
          <p className="text-[12.5px] text-ink-muted">
            Showing <span className="font-medium text-ink">{(data.page - 1) * data.pageSize + 1}</span> to{" "}
            <span className="font-medium text-ink">
              {Math.min(data.page * data.pageSize, data.total)}
            </span>{" "}
            of <span className="font-medium text-ink">{data.total}</span> customers
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(data.page - 1)}
              disabled={data.page <= 1 || loading}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(data.page + 1)}
              disabled={data.page >= data.totalPages || loading}
            >
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
