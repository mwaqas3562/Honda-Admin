"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatCurrency, formatNumber } from "@/lib/formatters";
import type {
  CategoryBreakdownPoint,
  DailySalesPoint,
  StockMovementPoint,
  TopPartPoint,
} from "@/types/reports";

const PALETTE = [
  "#1e3a5f",
  "#0050a0",
  "#0e8a6f",
  "#c97a14",
  "#8e3a8e",
  "#b94545",
  "#3a8ec9",
  "#6a8e3a",
  "#8e6a3a",
  "#3a3a8e",
];

const CHART_HEIGHT = 240;

/* ── Daily sales line chart ─────────────────────────────── */

export function DailySalesChart({ data }: { data: DailySalesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => String(v).slice(5)}
        />
        <YAxis
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => formatCompact(v as number)}
          width={50}
        />
        <Tooltip
          contentStyle={{ fontSize: 11 }}
          formatter={(v) => [formatCurrency(v as number), "Sales"]}
        />
        <Line
          type="monotone"
          dataKey="total"
          stroke={PALETTE[1]}
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ── Stock movement pie ─────────────────────────────────── */

const STOCK_LABELS: Record<StockMovementPoint["type"], string> = {
  PURCHASE_IN: "Purchase In",
  JOBCARD_OUT: "Job Card Out",
  ADJUSTMENT: "Adjustment",
};

export function StockMovementChart({ data }: { data: StockMovementPoint[] }) {
  const series = data.map((d) => ({
    name: STOCK_LABELS[d.type] ?? d.type,
    value: d.qty,
    count: d.count,
  }));
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <PieChart>
        <Tooltip
          contentStyle={{ fontSize: 11 }}
          formatter={(v, _n, p) => [
            `${formatNumber(v as number)} units`,
            (p as { payload?: { name?: string } }).payload?.name ?? "",
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Pie
          data={series}
          dataKey="value"
          nameKey="name"
          innerRadius={45}
          outerRadius={80}
          paddingAngle={2}
        >
          {series.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ── Top parts bar chart ────────────────────────────────── */

export function TopPartsChart({ data }: { data: TopPartPoint[] }) {
  const series = data.map((d) => ({
    name: d.name.length > 18 ? d.name.slice(0, 17) + "…" : d.name,
    qty: d.qty,
    revenue: d.revenue,
    sku: d.sku,
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(CHART_HEIGHT, series.length * 26 + 30)}>
      <BarChart
        data={series}
        layout="vertical"
        margin={{ top: 8, right: 12, bottom: 0, left: 8 }}
      >
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(v as number)} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
        <Tooltip
          contentStyle={{ fontSize: 11 }}
          formatter={(v, key) =>
            key === "revenue"
              ? [formatCurrency(v as number), "Revenue"]
              : [formatNumber(v as number), "Qty"]
          }
        />
        <Bar dataKey="qty" fill={PALETTE[2]} radius={[0, 2, 2, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Category breakdown bar chart ───────────────────────── */

export function CategoryBreakdownChart({
  data,
}: {
  data: CategoryBreakdownPoint[];
}) {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
        <XAxis dataKey="category" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(v as number)} width={50} />
        <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v) => [formatCurrency(v as number), "Value"]} />
        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
