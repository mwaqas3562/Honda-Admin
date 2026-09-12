"use client";

import { useReportFilters } from "@/hooks/useReportFilters";
import { useReportsOverview } from "@/hooks/useReportsOverview";
import {
  EmptyState,
  ErrorState,
  ExportCSV,
  LoadingSkeleton,
  ReportGrid,
  ReportPageHeader,
  ReportPanel,
  ReportToolbar,
  type ExportColumn,
} from "@/components/reports";
import TrendKPICard from "@/components/reports/TrendKPICard";
import {
  CategoryBreakdownChart,
  DailySalesChart,
  TopPartsChart,
} from "@/components/reports/charts/OverviewCharts";
import { formatCurrency, formatInteger } from "@/lib/formatters";
import { formatRangeLabel } from "@/lib/report-filters";
import type { TopPartPoint } from "@/types/reports";

export default function ReportsOverviewPage() {
  const filters = useReportFilters("today");
  const { data, loading, error, refetch } = useReportsOverview({
    from: filters.range.from,
    to: filters.range.to,
    lowStock: 5,
    topN: 10,
  });

  const topPartsCols: ExportColumn<TopPartPoint>[] = [
    { header: "SKU", accessor: "sku" },
    { header: "Part", accessor: "name" },
    { header: "Quantity Issued", accessor: "qty" },
    { header: "Revenue", accessor: "revenue" },
  ];

  return (
    <div className="space-y-3">
      <ReportPageHeader
        title="Reports & Analytics Overview"
        description={`Range: ${formatRangeLabel(filters.range)}`}
        actions={
          data && (
            <ExportCSV
              filename="top-parts"
              rows={data.charts.topParts}
              columns={topPartsCols}
              label="Export Top Parts"
            />
          )
        }
      />

      <ReportToolbar filters={filters} showSearch={false} />

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading || !data ? (
        <>
          <LoadingSkeleton variant="cards" rows={6} />
          <ReportGrid cols={2}>
            <LoadingSkeleton variant="lines" rows={6} />
            <LoadingSkeleton variant="lines" rows={6} />
            <LoadingSkeleton variant="lines" rows={6} />
            <LoadingSkeleton variant="lines" rows={6} />
          </ReportGrid>
        </>
      ) : (
        <>
          {/* ── 6 KPI Cards ───────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <TrendKPICard
              label="Inventory Value"
              value={formatCurrency(data.metrics.inventoryValue.value)}
              hint={data.metrics.inventoryValue.hint}
              trendPct={data.metrics.inventoryValue.trendPct}
            />
            <TrendKPICard
              label="Sales Revenue"
              value={formatCurrency(data.metrics.salesRevenue.value)}
              hint={data.metrics.salesRevenue.hint}
              trendPct={data.metrics.salesRevenue.trendPct}
              accentClass="text-emerald-700"
            />
            <TrendKPICard
              label="Purchase Costs"
              value={formatCurrency(data.metrics.purchaseCosts.value)}
              trendPct={data.metrics.purchaseCosts.trendPct}
              invert
              accentClass="text-orange-700"
            />
            <TrendKPICard
              label="Services Revenue"
              value={formatCurrency(data.metrics.servicesRevenue.value)}
              trendPct={data.metrics.servicesRevenue.trendPct}
              accentClass="text-emerald-700"
            />
            <TrendKPICard
              label="Gross Profit"
              value={formatCurrency(data.metrics.grossProfit.value)}
              trendPct={data.metrics.grossProfit.trendPct}
              accentClass={
                data.metrics.grossProfit.value >= 0
                  ? "text-emerald-700"
                  : "text-red-700"
              }
            />
            {/* Low Stock Count KPI removed */}
          </div>

          {/* ── Charts ────────────────────────────────────── */}
          <ReportGrid cols={2}>
            <ReportPanel title="Daily Sales Trend">
              {data.charts.dailySales.length === 0 ? (
                <EmptyState title="No sales in this range" variant="inline" />
              ) : (
                <DailySalesChart data={data.charts.dailySales} />
              )}
            </ReportPanel>

            {/* Stock Movement chart removed */}

            <ReportPanel title="Top 10 Parts (by qty issued)">
              {data.charts.topParts.length === 0 ? (
                <EmptyState title="No parts issued" variant="inline" />
              ) : (
                <TopPartsChart data={data.charts.topParts} />
              )}
            </ReportPanel>

            <ReportPanel title="Service Category Breakdown">
              {data.charts.categoryBreakdown.length === 0 ? (
                <EmptyState title="No completed services" variant="inline" />
              ) : (
                <CategoryBreakdownChart data={data.charts.categoryBreakdown} />
              )}
            </ReportPanel>
          </ReportGrid>
        </>
      )}
    </div>
  );
}
