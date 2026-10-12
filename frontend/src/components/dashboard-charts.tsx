"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  useChartSeriesVisibility,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableCheckbox,
  useRowSelection,
} from "@/components/ui/table-select";
import { categoryLabels } from "@/lib/mock-reconciliation";
import { formatPeriodLabel } from "@/lib/period-from-file";
import type { MismatchCategory, ReconciliationResult } from "@/lib/types";

export type InventoryPeriodStats = {
  ceirRows: number;
  payplusRows: number;
  ceirFiles: number;
  payplusFiles: number;
};

export type CategoryFigures = Record<
  MismatchCategory,
  { count: number; amount: number }
>;

export type PeriodSeriesPoint = {
  period: string;
  result: ReconciliationResult | null;
  inventory: InventoryPeriodStats | null;
  /** Pre-aggregated on the server. When set, mismatch rows are not required. */
  categories?: Partial<CategoryFigures>;
};

export const description = "Difference categories over time";

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

const chartConfig = {
  unconfirmed: {
    label: categoryLabels.unconfirmed,
    color: CATEGORY_COLORS.unconfirmed,
  },
  fraud: {
    label: categoryLabels.fraud,
    color: CATEGORY_COLORS.fraud,
  },
  duplicate: {
    label: categoryLabels.duplicate,
    color: CATEGORY_COLORS.duplicate,
  },
  overpay: {
    label: categoryLabels.overpay,
    color: CATEGORY_COLORS.overpay,
  },
  month_boundary: {
    label: categoryLabels.month_boundary,
    color: CATEGORY_COLORS.month_boundary,
  },
} satisfies ChartConfig;

type ChartRow = {
  date: string;
  period: string;
  unconfirmed: number;
  fraud: number;
  duplicate: number;
  overpay: number;
  month_boundary: number;
  counts: Record<MismatchCategory, number>;
  amounts: Record<MismatchCategory, number>;
  totalDiffs: number;
  totalAmount: number;
};

function periodToMonthDate(period: string): string {
  const [y, m] = period.split("-");
  if (!y || !m) return period;
  return `${y}-${m}-01`;
}

function formatMonthTick(value: string) {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return value;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function currentPeriodKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftPeriod(period: string, deltaMonths: number): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  const date = new Date(y, m - 1 + deltaMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthsBetweenInclusive(from: string, to: string): string[] {
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = shiftPeriod(cursor, 1);
    if (out.length > 60) break;
  }
  return out;
}

function emptyCategoryMap(): Record<MismatchCategory, number> {
  return {
    unconfirmed: 0,
    fraud: 0,
    duplicate: 0,
    overpay: 0,
    month_boundary: 0,
  };
}

function categoriesFromResult(
  result: ReconciliationResult | null | undefined,
): {
  counts: Record<MismatchCategory, number>;
  amounts: Record<MismatchCategory, number>;
} {
  const counts = emptyCategoryMap();
  const amounts = emptyCategoryMap();
  if (!result?.mismatches?.length) return { counts, amounts };

  for (const row of result.mismatches) {
    counts[row.category] += 1;
    amounts[row.category] += row.amountMmk ?? 0;
  }
  return { counts, amounts };
}

export function categoryFigures(point: PeriodSeriesPoint): {
  counts: Record<MismatchCategory, number>;
  amounts: Record<MismatchCategory, number>;
} {
  if (point.categories) {
    const counts = emptyCategoryMap();
    const amounts = emptyCategoryMap();
    for (const key of CATEGORY_ORDER) {
      const item = point.categories[key];
      counts[key] = item?.count ?? 0;
      amounts[key] = item?.amount ?? 0;
    }
    return { counts, amounts };
  }
  return categoriesFromResult(point.result);
}

/** Always cover at least 12 months; missing months stay at 0. */
function fillAtLeastOneYear(periodKeys: string[]): string[] {
  const keys = [...periodKeys].sort();
  const end = keys[keys.length - 1] ?? currentPeriodKey();
  const dataStart = keys[0] ?? end;
  const yearStart = shiftPeriod(end, -11);
  const start = dataStart < yearStart ? dataStart : yearStart;
  return monthsBetweenInclusive(start, end);
}

function buildChartRows(series: PeriodSeriesPoint[]): ChartRow[] {
  const sorted = series
    .filter((point) => point.period !== "—")
    .slice()
    .sort((a, b) => a.period.localeCompare(b.period));

  const byPeriod = new Map(
    sorted.map((point) => [point.period, categoryFigures(point)] as const),
  );

  const span = fillAtLeastOneYear([...byPeriod.keys()]);

  return span.map((period) => {
    const { counts, amounts } = byPeriod.get(period) ?? {
      counts: emptyCategoryMap(),
      amounts: emptyCategoryMap(),
    };
    const totalDiffs = CATEGORY_ORDER.reduce((sum, key) => sum + counts[key], 0);
    const totalAmount = CATEGORY_ORDER.reduce(
      (sum, key) => sum + amounts[key],
      0,
    );

    return {
      date: periodToMonthDate(period),
      period,
      unconfirmed: counts.unconfirmed,
      fraud: counts.fraud,
      duplicate: counts.duplicate,
      overpay: counts.overpay,
      month_boundary: counts.month_boundary,
      counts,
      amounts,
      totalDiffs,
      totalAmount,
    };
  });
}

function activeCategories(row: ChartRow) {
  return CATEGORY_ORDER.filter(
    (key) => row.counts[key] > 0 || row.amounts[key] > 0,
  ).map((key) => ({
    key,
    label: categoryLabels[key],
    count: row.counts[key],
    amount: row.amounts[key],
  }));
}

function formatAmount(value: number) {
  return `${value.toLocaleString()} MMK`;
}

function MonthCategoryTooltip({
  active,
  payload,
  visibleKeys,
}: TooltipProps<number, string> & {
  visibleKeys?: ReadonlySet<MismatchCategory>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow | undefined;
  if (!row) return null;

  const items = activeCategories(row).filter(
    (item) => !visibleKeys || visibleKeys.has(item.key),
  );
  if (items.length === 0) return null;

  return (
    <div className="min-w-[240px] rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-xs shadow-xl">
      <p className="text-[13px] font-semibold text-[var(--ink)]">
        {formatPeriodLabel(row.period)}
      </p>
      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
        {row.totalDiffs.toLocaleString()} difference
        {row.totalDiffs === 1 ? "" : "s"}
        {row.totalAmount > 0 ? ` · ${formatAmount(row.totalAmount)}` : ""}
      </p>
      <div className="mt-2 space-y-1.5 border-t border-[var(--line-soft)] pt-2">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: CATEGORY_COLORS[item.key] }}
              />
              <span className="truncate text-[var(--muted)]">{item.label}</span>
            </div>
            <div className="shrink-0 text-right font-[family-name:var(--font-mono)]">
              <p className="font-semibold text-[var(--ink)]">
                {item.count.toLocaleString()}
              </p>
              {item.amount > 0 ? (
                <p className="text-[10px] text-[var(--muted)]">
                  {formatAmount(item.amount)}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyValuesTable({ rows }: { rows: ChartRow[] }) {
  const monthsWithData = React.useMemo(
    () =>
      rows.filter((row) => row.totalDiffs > 0 || row.totalAmount > 0),
    [rows],
  );
  const ids = React.useMemo(
    () => monthsWithData.map((row) => row.period),
    [monthsWithData],
  );
  const selection = useRowSelection(ids);

  if (monthsWithData.length === 0) return null;

  return (
    <div className="space-y-2">
      {selection.selectedCount > 0 ? (
        <p className="text-[12px] text-[var(--muted)]">
          {selection.selectedCount} selected
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-[var(--line-soft)]">
        <table className="min-w-full border-collapse text-left text-[12px]">
          <thead className="bg-[#f8fafc] text-[11px] text-[var(--muted)]">
            <tr>
              <th className="w-10 px-3 py-2">
                <TableCheckbox
                  checked={selection.allSelected}
                  indeterminate={selection.someSelected}
                  onChange={(next) => selection.toggleAll(next)}
                  label="Select all months"
                />
              </th>
              <th className="px-3 py-2 font-medium">Month</th>
              {CATEGORY_ORDER.map((key) => (
                <th key={key} className="px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-[2px]"
                      style={{ backgroundColor: CATEGORY_COLORS[key] }}
                    />
                    {categoryLabels[key]}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {monthsWithData.map((row) => {
              const checked = selection.isSelected(row.period);
              return (
                <tr
                  key={row.period}
                  className={`border-t border-[var(--line-soft)] text-[var(--ink)] ${
                    checked ? "bg-[#eef4fb]" : ""
                  }`}
                  onClick={() => selection.toggleOne(row.period, !checked)}
                >
                  <td className="px-3 py-2">
                    <TableCheckbox
                      checked={checked}
                      onChange={(next) =>
                        selection.toggleOne(row.period, next)
                      }
                      label={`Select ${formatPeriodLabel(row.period)}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {formatPeriodLabel(row.period)}
                  </td>
                  {CATEGORY_ORDER.map((key) => {
                    const count = row.counts[key];
                    const amount = row.amounts[key];
                    if (count === 0 && amount === 0) {
                      return (
                        <td
                          key={key}
                          className="px-3 py-2 text-[var(--muted)]"
                        >
                          —
                        </td>
                      );
                    }
                    return (
                      <td
                        key={key}
                        className="px-3 py-2 font-[family-name:var(--font-mono)]"
                      >
                        <div>{count.toLocaleString()}</div>
                        {amount > 0 ? (
                          <div className="text-[10px] text-[var(--muted)]">
                            {formatAmount(amount)}
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 font-[family-name:var(--font-mono)] font-semibold">
                    <div>{row.totalDiffs.toLocaleString()}</div>
                    {row.totalAmount > 0 ? (
                      <div className="text-[10px] font-normal text-[var(--muted)]">
                        {formatAmount(row.totalAmount)}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ChartAreaInteractive({
  series,
  followSeries = false,
}: {
  series: PeriodSeriesPoint[];
  mode?: "auto" | "inventory" | "analysis";
  /** Use the months already loaded by the dashboard range. */
  followSeries?: boolean;
}) {
  const [timeRange, setTimeRange] = React.useState("6m");
  const [selectedPeriod, setSelectedPeriod] = React.useState<string | null>(
    null,
  );
  const seriesVis = useChartSeriesVisibility(CATEGORY_ORDER);
  const visibleKeys = React.useMemo(() => {
    return new Set(
      CATEGORY_ORDER.filter((key) => !seriesVis.hidden.has(key)),
    );
  }, [seriesVis.hidden]);

  const allRows = React.useMemo(() => buildChartRows(series), [series]);

  const filteredData = React.useMemo(() => {
    if (followSeries || allRows.length === 0 || timeRange === "all") {
      return allRows;
    }
    const months = timeRange === "6m" ? 6 : timeRange === "3m" ? 3 : 12;
    return allRows.slice(-months);
  }, [allRows, timeRange, followSeries]);

  const tableRows = React.useMemo(
    () => (followSeries ? allRows : allRows.slice(-6)),
    [allRows, followSeries],
  );

  React.useEffect(() => {
    if (!selectedPeriod) return;
    if (!filteredData.some((row) => row.period === selectedPeriod)) {
      setSelectedPeriod(null);
    }
  }, [filteredData, selectedPeriod]);

  const selectedRow =
    filteredData.find((row) => row.period === selectedPeriod) ?? null;

  const hasAnyDiffs = filteredData.some(
    (row) => row.totalDiffs > 0 || row.totalAmount > 0,
  );

  return (
    <Card className="border-[var(--line)] bg-white pt-0 shadow-[0_1px_2px_rgba(26,43,74,0.04)]">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b border-[var(--line-soft)] py-4 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle className="text-[15px] text-[var(--ink)]">
            Difference categories over time
          </CardTitle>
          <CardDescription className="text-[var(--muted)]">
            {followSeries
              ? "Months in the selected range · click the legend to show or hide"
              : "Category trends by month · click legend to show/hide"}
          </CardDescription>
        </div>
        {followSeries ? null : (
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger
            className="hidden w-[150px] rounded-lg sm:ml-auto sm:flex"
            aria-label="Select range"
          >
            <SelectValue placeholder="Last 6 months" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="12m" className="rounded-lg">
              Last 12 months
            </SelectItem>
            <SelectItem value="6m" className="rounded-lg">
              Last 6 months
            </SelectItem>
            <SelectItem value="3m" className="rounded-lg">
              Last 3 months
            </SelectItem>
            <SelectItem value="all" className="rounded-lg">
              All periods
            </SelectItem>
          </SelectContent>
        </Select>
        )}
      </CardHeader>
      <CardContent className="space-y-4 px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[280px] w-full"
        >
          <AreaChart
            data={filteredData}
            margin={{ left: 8, right: 8 }}
            onClick={(state) => {
              if (followSeries) return;
              const row = state?.activePayload?.[0]?.payload as
                | ChartRow
                | undefined;
              if (!row || (row.totalDiffs === 0 && row.totalAmount === 0)) {
                return;
              }
              setSelectedPeriod(row.period);
            }}
          >
            <defs>
              {CATEGORY_ORDER.map((key) => (
                <linearGradient
                  key={key}
                  id={`fill-${key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={`var(--color-${key})`}
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor={`var(--color-${key})`}
                    stopOpacity={0.1}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={formatMonthTick}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={44}
              allowDecimals={false}
              tickFormatter={(value) => Number(value).toLocaleString()}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--line)", strokeDasharray: "4 4" }}
              content={<MonthCategoryTooltip visibleKeys={visibleKeys} />}
            />
            {CATEGORY_ORDER.map((key) => (
              <Area
                key={key}
                dataKey={key}
                type="natural"
                fill={`url(#fill-${key})`}
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                stackId="diffs"
                hide={!seriesVis.isVisible(key)}
                activeDot={{
                  r: 5,
                  onClick: (_event, dot) => {
                    if (followSeries) return;
                    const row = (dot as { payload?: ChartRow })?.payload;
                    if (
                      !row ||
                      (row.totalDiffs === 0 && row.totalAmount === 0)
                    ) {
                      return;
                    }
                    setSelectedPeriod(row.period);
                  },
                }}
              />
            ))}
            <ChartLegend
              content={
                <ChartLegendContent
                  hiddenKeys={seriesVis.hidden}
                  onItemClick={seriesVis.toggle}
                />
              }
            />
          </AreaChart>
        </ChartContainer>

        {!hasAnyDiffs ? (
          <p className="px-1 text-[12px] text-[var(--muted)]">
            No difference category values yet. Run Analysis on a date range to
            populate the chart.
          </p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-[12px] font-medium text-[var(--ink)]">
                {followSeries
                  ? "Months in the selected range"
                  : "Monthly category values · last 6 months"}
              </p>
              <MonthlyValuesTable rows={tableRows} />
            </div>

            {!followSeries && selectedRow ? (
              <div className="rounded-lg border border-[var(--line-soft)] bg-[#f8fafc] px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[12px] font-medium text-[var(--ink)]">
                    {formatPeriodLabel(selectedRow.period)}
                  </p>
                  <button
                    type="button"
                    className="text-[11px] text-[var(--muted)] underline-offset-2 hover:underline"
                    onClick={() => setSelectedPeriod(null)}
                  >
                    Clear
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {activeCategories(selectedRow).map((item) => (
                    <div
                      key={item.key}
                      className="rounded-md border border-[var(--line-soft)] bg-white px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-[2px]"
                          style={{
                            backgroundColor: CATEGORY_COLORS[item.key],
                          }}
                        />
                        <p className="text-[11px] text-[var(--muted)]">
                          {item.label}
                        </p>
                      </div>
                      <p className="mt-1 font-[family-name:var(--font-mono)] text-[14px] font-semibold text-[var(--ink)]">
                        {item.count.toLocaleString()}
                      </p>
                      {item.amount > 0 ? (
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                          {formatAmount(item.amount)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardAnalytics({
  series,
  mode = "auto",
  followSeries = false,
}: {
  series: PeriodSeriesPoint[];
  mode?: "auto" | "inventory" | "analysis";
  followSeries?: boolean;
}) {
  const points: PeriodSeriesPoint[] =
    series.length > 0
      ? series
      : [{ period: "—", result: null, inventory: null }];

  return (
    <ChartAreaInteractive
      series={points}
      mode={mode}
      followSeries={followSeries}
    />
  );
}
