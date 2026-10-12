"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AnalysisDateRangePicker,
  calendarRangeToPeriodKeys,
  periodKeysToCalendarRange,
  type AnalysisDateRange,
} from "@/components/analysis-date-range-picker";
import {
  DashboardAnalytics,
  type PeriodSeriesPoint,
} from "@/components/dashboard-charts";
import type { ReconciliationState } from "@/hooks/use-reconciliation";
import { fetchLatestReconciliation, fetchUploadSummary } from "@/lib/api";
import { categoryLabels } from "@/lib/mock-reconciliation";
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

function monthsInRange(from: string, to: string): string[] {
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 48) break;
  }
  return out;
}

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

function mapApiResult(item: {
  periodLabel: string;
  matchedCount: number;
  mismatchCount: number;
  irdPaid: number;
  ceirPaid: number;
  adjustedIrdSum: number;
  adjustedCeirSum: number;
  sumsEqual: boolean;
  summary: ReconciliationResult["summary"];
  mismatches: ReconciliationResult["mismatches"];
}): ReconciliationResult {
  return {
    periodLabel: item.periodLabel,
    matchedCount: item.matchedCount,
    mismatchCount: item.mismatchCount,
    irdPaid: item.irdPaid,
    ceirPaid: item.ceirPaid,
    adjustedIrdSum: item.adjustedIrdSum,
    adjustedCeirSum: item.adjustedCeirSum,
    sumsEqual: item.sumsEqual,
    summary: item.summary,
    mismatches: item.mismatches,
  };
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

const CATEGORY_COLORS: Record<MismatchCategory, string> = {
  unconfirmed: "var(--chart-1)",
  fraud: "var(--chart-4)",
  duplicate: "var(--chart-5)",
  overpay: "var(--chart-3)",
  month_boundary: "var(--chart-2)",
};

export function DashboardView({
  status,
  fileCounts,
  availablePeriods,
  inventoryVersion,
  analysisResult,
  onGoInventory,
  onGoAnalysis,
}: DashboardViewProps) {
  const totalFiles = fileCounts.ceir + fileCounts.payplus;
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

  const periodsToLoad = useMemo(() => {
    const stored = availablePeriods
      .filter((period) => period >= range.from && period <= range.to)
      .slice()
      .sort();
    if (stored.length > 0) return stored;
    return monthsInRange(range.from, range.to);
  }, [availablePeriods, range.from, range.to]);

  function handleRangeChange(next: AnalysisDateRange) {
    const keys = calendarRangeToPeriodKeys(next);
    setRange(keys);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingSeries(true);
      try {
        const [periodPoints, globalLatest] = await Promise.all([
          Promise.all(
            periodsToLoad.map(async (period) => {
              const [summary, result] = await Promise.all([
                fetchUploadSummary(period)
                  .then((item) => ({
                    ceirRows: item.sides.ceir.rowCount,
                    payplusRows: item.sides.payplus.rowCount,
                    ceirFiles: item.sides.ceir.batchCount,
                    payplusFiles: item.sides.payplus.batchCount,
                  }))
                  .catch(() => null),
                fetchLatestReconciliation(period)
                  .then(mapApiResult)
                  .catch(() => null),
              ]);

              return {
                period,
                result,
                inventory: summary,
              } satisfies PeriodSeriesPoint;
            }),
          ),
          fetchLatestReconciliation()
            .then(mapApiResult)
            .catch(() => null),
        ]);

        // Prefer live session result, then API global latest.
        const fallbackResult = analysisResult ?? globalLatest;
        const byPeriod = new Map(
          periodPoints.map((point) => [point.period, point] as const),
        );

        if (fallbackResult?.mismatches?.length) {
          const keys = periodKeysFromLabel(fallbackResult.periodLabel);
          // Put range/single analysis totals on the end month so the chart
          // has category values without double-counting across months.
          const target =
            keys?.to ??
            periodsToLoad[periodsToLoad.length - 1] ??
            null;
          if (target) {
            const existing = byPeriod.get(target);
            if (existing && !existing.result?.mismatches?.length) {
              byPeriod.set(target, { ...existing, result: fallbackResult });
            } else if (!existing) {
              byPeriod.set(target, {
                period: target,
                result: fallbackResult,
                inventory: null,
              });
            }
          }
        }

        const points = periodsToLoad.map((period) => {
          const existing = byPeriod.get(period);
          return (
            existing ?? {
              period,
              result: null,
              inventory: null,
            }
          );
        });

        if (!cancelled) setSeries(points);
      } finally {
        if (!cancelled) setLoadingSeries(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [periodsToLoad, inventoryVersion, analysisResult]);

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

    for (const point of series) {
      for (const row of point.result?.mismatches ?? []) {
        counts[row.category] += 1;
        amounts[row.category] += row.amountMmk ?? 0;
      }
    }

    return CATEGORY_ORDER.map((key) => ({
      key,
      label: categoryLabels[key],
      count: counts[key],
      amount: amounts[key],
      color: CATEGORY_COLORS[key],
    }));
  }, [series]);

  const statusLabel =
    status === "analyzed"
      ? "Analyzed"
      : status === "ready"
        ? "Ready"
        : "No analysis yet";

  const hasInventoryInSeries = totalFiles > 0;

  return (
    <div className="space-y-3">
      <section className="app-card overflow-visible">
        <div className="flex flex-col gap-3 border-b border-[var(--line-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--ink)]">
              Dashboard
            </h2>
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">
              {rangeLabel(range)} · Analysis: {statusLabel}
            </p>
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
              className="app-btn-outline app-btn-sm"
              onClick={onGoAnalysis}
            >
              Analysis
            </button>
            <AnalysisDateRangePicker
              value={calendarValue}
              onChange={handleRangeChange}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-soft)] sm:grid-cols-3 xl:grid-cols-5 xl:divide-y-0">
          {categoryTotals.map((item) => (
            <div key={item.key} className="px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: item.color }}
                />
                <p className="truncate text-[12px] text-[var(--muted)]">
                  {item.label}
                </p>
              </div>
              <p className="mt-1 font-[family-name:var(--font-mono)] text-[15px] font-semibold text-[var(--ink)]">
                {item.count.toLocaleString()}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                {item.amount > 0
                  ? `${item.amount.toLocaleString()} MMK`
                  : "—"}
              </p>
            </div>
          ))}
        </div>
      </section>

      {hasInventoryInSeries ? (
        <section className="app-card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-[13px] font-medium text-[var(--ink)]">
              Inventory totals are live
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Difference category chart fills after Analysis is run for a date
              range.
            </p>
          </div>
          <button
            type="button"
            className="app-btn-primary app-btn-sm shrink-0"
            onClick={onGoAnalysis}
          >
            Open Analysis
          </button>
        </section>
      ) : null}

      {loadingSeries ? (
        <p className="px-1 text-[12px] text-[var(--muted)]">Updating charts…</p>
      ) : null}

      <DashboardAnalytics series={series} mode="inventory" />
    </div>
  );
}
