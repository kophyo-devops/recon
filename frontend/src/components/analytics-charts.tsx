"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  useChartSeriesVisibility,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMmk } from "@/lib/format";
import { categoryLabels } from "@/lib/mock-reconciliation";
import type { MismatchCategory, ReconciliationResult } from "@/lib/types";

type AnalyticsChartsProps = {
  result: ReconciliationResult | null;
};

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

const exceptionMixChartConfig = {
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

type ExceptionMixRow = {
  category: MismatchCategory;
  label: string;
  unconfirmed: number;
  fraud: number;
  duplicate: number;
  overpay: number;
  month_boundary: number;
  count: number;
  amount: number;
};

function PaidComparisonChart({
  irdPaid,
  ceirPaid,
}: {
  irdPaid: number;
  ceirPaid: number;
}) {
  const max = Math.max(irdPaid, ceirPaid, 1);
  const chartH = 160;
  const chartW = 280;
  const barW = 72;
  const gap = 48;
  const baseY = chartH - 8;
  const leftX = 40;
  const rightX = leftX + barW + gap;
  const irdH =
    irdPaid <= 0 ? 0 : Math.max(8, Math.round((irdPaid / max) * (chartH - 36)));
  const ceirH =
    ceirPaid <= 0 ? 0 : Math.max(8, Math.round((ceirPaid / max) * (chartH - 36)));
  const gapCount = irdPaid - ceirPaid;

  return (
    <div>
      <svg
        viewBox={`0 0 ${chartW} ${chartH + 28}`}
        className="mx-auto h-[200px] w-full max-w-[320px]"
        role="img"
        aria-label={`Paid comparison: HUB ${irdPaid}, CEIR ${ceirPaid}`}
      >
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const y = baseY - t * (chartH - 36);
          return (
            <line
              key={t}
              x1={24}
              x2={chartW - 8}
              y1={y}
              y2={y}
              stroke="#e6edf3"
              strokeWidth="1"
            />
          );
        })}
        {irdH > 0 ? (
          <rect
            x={leftX}
            y={baseY - irdH}
            width={barW}
            height={irdH}
            rx="4"
            fill="#1a2b4a"
          />
        ) : null}
        {ceirH > 0 ? (
          <rect
            x={rightX}
            y={baseY - ceirH}
            width={barW}
            height={ceirH}
            rx="4"
            fill="#8aa0b5"
          />
        ) : null}
        <line
          x1={leftX}
          x2={leftX + barW}
          y1={baseY}
          y2={baseY}
          stroke="#c5d0db"
          strokeWidth="2"
        />
        <line
          x1={rightX}
          x2={rightX + barW}
          y1={baseY}
          y2={baseY}
          stroke="#c5d0db"
          strokeWidth="2"
        />
        <text
          x={leftX + barW / 2}
          y={irdH > 0 ? baseY - irdH - 8 : baseY - 10}
          textAnchor="middle"
          className="fill-[var(--ink)]"
          style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
        >
          {irdPaid.toLocaleString()}
        </text>
        <text
          x={rightX + barW / 2}
          y={ceirH > 0 ? baseY - ceirH - 8 : baseY - 10}
          textAnchor="middle"
          className="fill-[var(--ink)]"
          style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
        >
          {ceirPaid.toLocaleString()}
        </text>
        <text
          x={leftX + barW / 2}
          y={chartH + 18}
          textAnchor="middle"
          className="fill-[var(--muted)]"
          style={{ fontSize: 11 }}
        >
          HUB / PayPlus
        </text>
        <text
          x={rightX + barW / 2}
          y={chartH + 18}
          textAnchor="middle"
          className="fill-[var(--muted)]"
          style={{ fontSize: 11 }}
        >
          CEIR
        </text>
      </svg>
      <p className="mt-1 text-center text-[12px] text-[var(--muted)]">
        Count gap (HUB − CEIR):{" "}
        <span className="font-[family-name:var(--font-mono)] text-[var(--ink)]">
          {gapCount > 0 ? `+${gapCount}` : gapCount}
        </span>
      </p>
    </div>
  );
}

const matchRateChartConfig = {
  matched: {
    label: "Matched",
    color: "var(--chart-2)",
  },
  exceptions: {
    label: "Exceptions",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function MatchRateRadial({
  matched,
  exceptions,
  periodLabel,
}: {
  matched: number;
  exceptions: number;
  periodLabel: string;
}) {
  const total = matched + exceptions;
  const matchRate =
    total > 0 ? Math.round((matched / total) * 1000) / 10 : 0;
  const chartData = [{ period: "current", matched, exceptions }];
  const TrendIcon = matchRate >= 50 ? TrendingUp : TrendingDown;

  return (
    <Card className="flex h-full flex-col border-[var(--line)] bg-white shadow-sm">
      <CardHeader className="items-center pb-0">
        <CardTitle className="text-[14px] text-[var(--ink)]">
          Match rate
        </CardTitle>
        <CardDescription className="text-[var(--muted)]">
          {periodLabel || "Selected analysis range"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 items-center pb-0">
        <ChartContainer
          config={matchRateChartConfig}
          className="mx-auto aspect-square w-full max-w-[250px]"
        >
          <RadialBarChart
            data={chartData}
            endAngle={180}
            innerRadius={80}
            outerRadius={110}
          >
            <RadialBar
              dataKey="exceptions"
              fill="var(--color-exceptions)"
              stackId="a"
              cornerRadius={5}
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="matched"
              stackId="a"
              cornerRadius={5}
              fill="var(--color-matched)"
              className="stroke-transparent stroke-2"
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 16}
                          className="fill-[var(--ink)] font-[family-name:var(--font-mono)] text-2xl font-bold"
                        >
                          {matchRate.toLocaleString()}%
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 4}
                          className="fill-[var(--muted)] text-[12px]"
                        >
                          Match rate
                        </tspan>
                      </text>
                    );
                  }
                  return null;
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center gap-2 leading-none font-medium text-[var(--ink)]">
          {matched.toLocaleString()} matched · {exceptions.toLocaleString()}{" "}
          exceptions
          <TrendIcon className="h-4 w-4" />
        </div>
        <div className="leading-none text-[var(--muted)]">
          Stacked matched vs exception rows for this run
        </div>
      </CardFooter>
    </Card>
  );
}

function ExceptionMixTooltip({
  active,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ExceptionMixRow | undefined;
  if (!row || row.count <= 0) return null;

  return (
    <div className="min-w-[200px] rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-xs shadow-xl">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-[2px]"
          style={{ backgroundColor: CATEGORY_COLORS[row.category] }}
        />
        <p className="text-[13px] font-semibold text-[var(--ink)]">
          {row.label}
        </p>
      </div>
      <p className="mt-1.5 font-[family-name:var(--font-mono)] text-[12px] font-semibold text-[var(--ink)]">
        {row.count.toLocaleString()} row{row.count === 1 ? "" : "s"}
      </p>
      {row.amount > 0 ? (
        <p className="mt-0.5 text-[11px] text-[var(--muted)]">
          {formatMmk(row.amount)}
        </p>
      ) : null}
    </div>
  );
}

function ExceptionMixArea({
  rows,
  periodLabel,
}: {
  rows: ExceptionMixRow[];
  periodLabel: string;
}) {
  const hasAny = rows.some((row) => row.count > 0 || row.amount > 0);
  const seriesVis = useChartSeriesVisibility(CATEGORY_ORDER);

  return (
    <Card className="border-[var(--line)] bg-white pt-0 shadow-sm lg:col-span-2">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b border-[var(--line-soft)] py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle className="text-[15px] text-[var(--ink)]">
            Exception mix
          </CardTitle>
          <CardDescription className="text-[var(--muted)]">
            {periodLabel
              ? `Category mix for ${periodLabel} · click legend to show/hide`
              : "Click a legend item to show or hide a category"}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={exceptionMixChartConfig}
          className="aspect-auto h-[280px] w-full"
        >
          <AreaChart data={rows} margin={{ left: 8, right: 8 }}>
            <defs>
              {CATEGORY_ORDER.map((key) => (
                <linearGradient
                  key={key}
                  id={`analysis-fill-${key}`}
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
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={8}
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
              content={<ExceptionMixTooltip />}
            />
            {CATEGORY_ORDER.map((key) => (
              <Area
                key={key}
                dataKey={key}
                type="natural"
                fill={`url(#analysis-fill-${key})`}
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                stackId="exceptions"
                hide={!seriesVis.isVisible(key)}
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
        {!hasAny ? (
          <p className="px-1 text-[12px] text-[var(--muted)]">
            No exception rows yet. Run analysis to populate the mix.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AnalyticsCharts({ result }: AnalyticsChartsProps) {
  const irdPaid = result?.irdPaid ?? 0;
  const ceirPaid = result?.ceirPaid ?? 0;
  const matchedCount = result?.matchedCount ?? 0;
  const mismatchCount = result?.mismatchCount ?? 0;
  const mismatches = result?.mismatches ?? [];

  const mixRows: ExceptionMixRow[] = CATEGORY_ORDER.map((key) => {
    const categoryRows = mismatches.filter((row) => row.category === key);
    const count = categoryRows.length;
    const amount = categoryRows.reduce(
      (sum, row) => sum + (row.amountMmk ?? 0),
      0,
    );
    return {
      category: key,
      label: categoryLabels[key],
      unconfirmed: key === "unconfirmed" ? count : 0,
      fraud: key === "fraud" ? count : 0,
      duplicate: key === "duplicate" ? count : 0,
      overpay: key === "overpay" ? count : 0,
      month_boundary: key === "month_boundary" ? count : 0,
      count,
      amount,
    };
  });

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="app-card overflow-hidden">
        <div className="border-b border-[var(--line-soft)] px-5 py-3">
          <h3 className="text-[14px] font-semibold text-[var(--ink)]">
            Paid applications
          </h3>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            HUB / PayPlus vs CEIR paid counts
          </p>
        </div>
        <div className="px-4 py-4">
          <PaidComparisonChart irdPaid={irdPaid} ceirPaid={ceirPaid} />
        </div>
      </section>

      <MatchRateRadial
        matched={matchedCount}
        exceptions={mismatchCount}
        periodLabel={result?.periodLabel ?? ""}
      />

      <ExceptionMixArea
        rows={mixRows}
        periodLabel={result?.periodLabel ?? ""}
      />
    </div>
  );
}
