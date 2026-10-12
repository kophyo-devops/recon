"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AnalysisDateRangePicker,
  calendarRangeToPeriodKeys,
  periodKeysToCalendarRange,
  type AnalysisDateRange,
} from "@/components/analysis-date-range-picker";
import {
  categoryFigures,
  DashboardAnalytics,
  type PeriodSeriesPoint,
} from "@/components/dashboard-charts";
import type { ReconciliationState } from "@/hooks/use-reconciliation";
import {
  fetchDashboardSeries,
  isAbortError,
  type DashboardMonth,
} from "@/lib/api";
import { formatMmk } from "@/lib/format";
import { formatPeriodLabel } from "@/lib/period-from-file";
import type { MismatchCategory, ReconciliationResult } from "@/lib/types";

type DashboardViewProps = {
  status: ReconciliationState["status"];
  fileCounts: { ceir: number; payplus: number };
  availablePeriods: string[];
  inventoryVersion: number;
  analysisResult: ReconciliationResult | null;
  onGoInventory: () => void;
  onGoAnalysis: () => void;
};

const MONTH_NAME_TO_NUM: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function parseMonthLabel(text: string): string | null {
  const match = text.trim().match(/^([A-Za-z]+)\s+(20\d{2})$/);
  if (!match) return null;
  const month = MONTH_NAME_TO_NUM[match[1].toLowerCase()];
  const year = Number(match[2]);
  if (!month || !year) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "September 2026" or "August 2026 – September 2026" → period keys */
function periodKeysFromLabel(label: string): { from: string; to: string } | null {
  const parts = label
    .split(/\s*[–—-]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const from = parseMonthLabel(parts[0] ?? "");
  const to = parseMonthLabel(parts[parts.length - 1] ?? "") ?? from;
  if (!from || !to) return null;
  return { from, to };
}

const dashboardSeriesCache = new Map<string, PeriodSeriesPoint[]>();

function rememberDashboardSeries(key: string, points: PeriodSeriesPoint[]) {
  dashboardSeriesCache.delete(key);
  dashboardSeriesCache.set(key, points);
  while (dashboardSeriesCache.size > 8) {
    const oldest = dashboardSeriesCache.keys().next().value;
    if (oldest == null) break;
    dashboardSeriesCache.delete(oldest);
  }
}

function monthToPoint(month: DashboardMonth): PeriodSeriesPoint {
  const hasRun = month.matchedCount != null;
  return {
    period: month.period,
    inventory: {
      ceirRows: month.ceirRows,
      payplusRows: month.payplusRows,
      ceirFiles: month.ceirFiles,
      payplusFiles: month.payplusFiles,
    },
    categories: month.categories,
    result: hasRun
      ? {
          periodLabel: month.period,
          matchedCount: month.matchedCount ?? 0,
          mismatchCount: month.mismatchCount ?? 0,
          irdPaid: month.irdPaid ?? 0,
          ceirPaid: month.ceirPaid ?? 0,
          adjustedIrdSum: month.adjustedIrdSum ?? 0,
          adjustedCeirSum: month.adjustedCeirSum ?? 0,
          sumsEqual: month.sumsEqual ?? false,
          summary: [],
          mismatches: [],
        }
      : null,
  };
}

function categoryCount(point: PeriodSeriesPoint) {
  return Object.values(categoryFigures(point).counts).reduce((sum, n) => sum + n, 0);
}

type DashboardPeriodRange = { from: string; to: string };

function defaultDashboardRange(
  availablePeriods: string[],
): DashboardPeriodRange {
  if (availablePeriods.length === 0) {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return { from: key, to: key };
  }
  const sorted = [...availablePeriods].sort();
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

function rangeLabel(range: DashboardPeriodRange) {
  return range.from === range.to
    ? formatPeriodLabel(range.from)
    : `${formatPeriodLabel(range.from)} – ${formatPeriodLabel(range.to)}`;
}

const CATEGORY_ORDER: MismatchCategory[] = [
  "unconfirmed",
  "fraud",
  "duplicate",
  "overpay",
  "month_boundary",
];

function MetricCard({
  label,
  value,
  detail,
  tone = "muted",
  wide = false,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "muted" | "ok" | "signal";
  wide?: boolean;
}) {
  const detailColor =
    tone === "ok"
      ? "text-[var(--ok)]"
      : tone === "signal"
        ? "text-[var(--signal)]"
        : "text-[var(--muted)]";

  return (
    <article className="app-card px-3.5 py-3">
      <p className="text-[12px] font-medium text-[var(--muted)]">{label}</p>
      <p
        className={`mt-1.5 font-[family-name:var(--font-mono)] font-semibold tracking-tight text-[var(--ink)] tabular-nums ${
          wide ? "text-[15px] leading-snug" : "text-[20px] leading-none"
        }`}
      >
        {value}
      </p>
      <p className={`mt-1.5 truncate text-[11px] ${detailColor}`}>{detail}</p>
    </article>
  );
}

export function DashboardView({
  status,
  fileCounts,
  availablePeriods,
  inventoryVersion,
  analysisResult,
  onGoInventory,
  onGoAnalysis,
}: DashboardViewProps) {
  const [range, setRange] = useState<DashboardPeriodRange>(() =>
    defaultDashboardRange(availablePeriods),
  );
  const [series, setSeries] = useState<PeriodSeriesPoint[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);

  // Seed / expand to cover newly stored periods when inventory changes,
  // without wiping a user-narrowed range that still overlaps inventory.
  useEffect(() => {
    if (availablePeriods.length === 0) return;
    const nextDefault = defaultDashboardRange(availablePeriods);
    setRange((prev) => {
      const overlaps = availablePeriods.some(
        (period) => period >= prev.from && period <= prev.to,
      );
      if (!overlaps) return nextDefault;
      return prev;
    });
  }, [availablePeriods, inventoryVersion]);

  const calendarValue = useMemo(
    () => periodKeysToCalendarRange(range.from, range.to),
    [range.from, range.to],
  );

  const seriesKey = `${inventoryVersion}|${range.from}|${range.to}`;

  function handleRangeChange(next: AnalysisDateRange) {
    const keys = calendarRangeToPeriodKeys(next);
    setRange(keys);
  }

  useEffect(() => {
    const cached = dashboardSeriesCache.get(seriesKey);
    if (cached) {
      setSeries(cached);
      setLoadingSeries(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLoadingSeries(true);

    fetchDashboardSeries(range.from, range.to, controller.signal)
      .then((months) => {
        const points = months.map(monthToPoint);
        rememberDashboardSeries(seriesKey, points);
        if (!cancelled) setSeries(points);
      })
      .catch((err: unknown) => {
        if (cancelled || isAbortError(err)) return;
        if (!cancelled) setSeries([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSeries(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [seriesKey, range.from, range.to]);

  const shownSeries = useMemo(() => {
    if (!analysisResult?.mismatches.length) return series;
    const target = periodKeysFromLabel(analysisResult.periodLabel)?.to;
    if (!target) return series;
    return series.map((point) => {
      if (point.period !== target || categoryCount(point) > 0) return point;
      const categories: PeriodSeriesPoint["categories"] = {};
      for (const row of analysisResult.mismatches) {
        const current = categories[row.category] ?? { count: 0, amount: 0 };
        current.count += 1;
        current.amount += row.amountMmk ?? 0;
        categories[row.category] = current;
      }
      return { ...point, categories };
    });
  }, [series, analysisResult]);

  const categoryTotals = useMemo(() => {
    const counts: Record<MismatchCategory, number> = {
      unconfirmed: 0,
      fraud: 0,
      duplicate: 0,
      overpay: 0,
      month_boundary: 0,
    };
    const amounts: Record<MismatchCategory, number> = {
      unconfirmed: 0,
      fraud: 0,
      duplicate: 0,
      overpay: 0,
      month_boundary: 0,
    };

    for (const point of shownSeries) {
      const figures = categoryFigures(point);
      for (const key of CATEGORY_ORDER) {
        counts[key] += figures.counts[key];
        amounts[key] += figures.amounts[key];
      }
    }

    return CATEGORY_ORDER.map((key) => ({
      key,
      count: counts[key],
      amount: amounts[key],
    }));
  }, [series]);

  const overview = useMemo(() => {
    let matched = 0;
    let irdPaid = 0;
    let ceirPaid = 0;
    let adjustedIrd = 0;
    let adjustedCeir = 0;
    let periodsWithResult = 0;
    let unequalPeriods = 0;
    let ceirFiles = 0;
    let payplusFiles = 0;

    for (const point of shownSeries) {
      if (point.inventory) {
        ceirFiles += point.inventory.ceirFiles;
        payplusFiles += point.inventory.payplusFiles;
      }
      if (!point.result) continue;
      periodsWithResult += 1;
      matched += point.result.matchedCount;
      irdPaid += point.result.irdPaid;
      ceirPaid += point.result.ceirPaid;
      adjustedIrd += point.result.adjustedIrdSum;
      adjustedCeir += point.result.adjustedCeirSum;
      if (!point.result.sumsEqual) unequalPeriods += 1;
    }

    const totalDiffs = categoryTotals.reduce((sum, item) => sum + item.count, 0);
    const totalAmount = categoryTotals.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    const decided = matched + totalDiffs;
    const matchRate =
      periodsWithResult > 0 && decided > 0
        ? Math.round((matched / decided) * 100)
        : null;

    return {
      matched,
      irdPaid,
      ceirPaid,
      adjustedIrd,
      adjustedCeir,
      periodsWithResult,
      ceirFiles,
      payplusFiles,
      totalDiffs,
      totalAmount,
      matchRate,
      sumsEqual: periodsWithResult > 0 && unequalPeriods === 0,
      gap: adjustedIrd - adjustedCeir,
    };
  }, [shownSeries, categoryTotals]);

  const statusLabel =
    status === "analyzed"
      ? "Analyzed"
      : status === "ready"
        ? "Ready"
        : "No analysis yet";

  const filesLabel = `${overview.ceirFiles.toLocaleString()} CEIR · ${overview.payplusFiles.toLocaleString()} PayPlus files`;
  const rangeStatus =
    overview.periodsWithResult > 0
      ? overview.totalDiffs === 0
        ? overview.sumsEqual
          ? `${filesLabel}. No differences, and adjusted sums match.`
          : `${filesLabel}. No difference rows, but adjusted sums do not match.`
        : filesLabel
      : overview.ceirFiles + overview.payplusFiles > 0
        ? `${filesLabel}. Run Analysis to calculate differences.`
        : fileCounts.ceir + fileCounts.payplus > 0
          ? "No files in this range. Other months in Inventory have uploads."
          : "No files stored yet. Upload in Inventory, then run Analysis.";

  const analyzed = overview.periodsWithResult > 0;
  const adjustedValue = !analyzed
    ? "—"
    : overview.sumsEqual
      ? "Equal"
      : `${overview.gap > 0 ? "+" : ""}${formatMmk(overview.gap)}`;
  const adjustedDetail = !analyzed
    ? "No analysis for this range"
    : overview.sumsEqual
      ? `${formatMmk(overview.adjustedIrd)} MMK on both sides`
      : "HUB adjusted sum minus CEIR";

  return (
    <div className="space-y-4">
      <section className="app-card overflow-visible">
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-semibold tracking-tight text-[var(--ink)]">
                Dashboard
              </h2>
              <span className="rounded-full border border-[var(--line-soft)] bg-[var(--canvas)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 truncate text-[13px] text-[var(--muted)]">
              {rangeLabel(range)}
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">{rangeStatus}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="app-btn-outline app-btn-sm"
              onClick={onGoInventory}
            >
              Inventory
            </button>
            <button
              type="button"
              className="app-btn-primary app-btn-sm"
              onClick={onGoAnalysis}
            >
              Open Analysis
            </button>
            <AnalysisDateRangePicker
              value={calendarValue}
              onChange={handleRangeChange}
            />
          </div>
        </div>
      </section>

      <div
        className={`grid grid-cols-2 gap-3 transition-opacity duration-200 xl:grid-cols-4 ${
          loadingSeries ? "opacity-60" : "opacity-100"
        }`}
      >
        <MetricCard
          label="Differences"
          value={analyzed ? overview.totalDiffs.toLocaleString() : "—"}
          detail={
            !analyzed
              ? "No analysis for this range"
              : overview.totalAmount > 0
                ? `${formatMmk(overview.totalAmount)} MMK`
                : "No amount on these rows"
          }
        />
        <MetricCard
          label="Matched"
          value={analyzed ? overview.matched.toLocaleString() : "—"}
          detail={
            overview.matchRate == null
              ? "No analysis for this range"
              : `${overview.matchRate}% of matched + differences`
          }
        />
        <MetricCard
          label="Paid records"
          wide
          value={
            analyzed
              ? `${overview.irdPaid.toLocaleString()} / ${overview.ceirPaid.toLocaleString()}`
              : "—"
          }
          detail="HUB / CEIR"
        />
        <MetricCard
          label="Adjusted sum"
          wide={!overview.sumsEqual && analyzed}
          value={adjustedValue}
          detail={adjustedDetail}
          tone={!analyzed ? "muted" : overview.sumsEqual ? "ok" : "signal"}
        />
      </div>

      <div
        className={`transition-opacity duration-200 ${
          loadingSeries ? "opacity-60" : "opacity-100"
        }`}
      >
        <DashboardAnalytics series={shownSeries} mode="inventory" followSeries />
      </div>
    </div>
  );
}
