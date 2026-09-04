"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { TrendPoint } from "@/types/client";

const emptySubscribe = () => () => {};

export interface DashboardTrendChartProps {
  trend: TrendPoint[];
}

export function DashboardTrendChart({ trend }: DashboardTrendChartProps) {
  const isMounted = React.useSyncExternalStore(emptySubscribe, () => true, () => false);

  const chartData = React.useMemo(() => {
    if (!trend || trend.length === 0) {
      return [];
    }

    return trend.map((point) => ({
      date: point.date.slice(5),
      recovered: Math.round(point.recoveredRevenue / 100),
      atRisk: Math.round(point.revenueAtRisk / 100),
      recoveries: point.successfulRecoveries,
    }));
  }, [trend]);

  if (!isMounted) {
    return <div className="h-52 w-full transition-all" />;
  }

  if (chartData.length === 0) {
    return (
      <div className="flex h-52 w-full flex-col items-center justify-center rounded-app border border-dashed border-line bg-surface/30 p-4 text-center">
        <span className="text-[12.5px] font-medium text-ink-muted">
          Recovery trend will populate as payment events are processed
        </span>
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="recoveredGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="atRiskGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#d97706" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#d97706" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            fontSize={10.5}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={10.5}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              color: "#ffffff",
              borderRadius: "6px",
              border: "none",
              fontSize: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: "8px 12px",
            }}
            itemStyle={{ color: "#ffffff" }}
            formatter={(value: unknown, name: unknown) => [
              `₹${Number(value || 0).toLocaleString("en-IN")}`,
              name === "recovered" ? "Recovered Revenue" : "Revenue at Risk",
            ]}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Area
            type="monotone"
            dataKey="atRisk"
            name="atRisk"
            stroke="#d97706"
            strokeWidth={1.5}
            fillOpacity={1}
            fill="url(#atRiskGradient)"
          />
          <Area
            type="monotone"
            dataKey="recovered"
            name="recovered"
            stroke="#059669"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#recoveredGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
