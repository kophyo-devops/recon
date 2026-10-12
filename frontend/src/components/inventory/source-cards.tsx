"use client";

import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";

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
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ReportSide } from "@/lib/types";

export type InventorySource = ReportSide | "all";

type SourceCardsProps = {
  ceirCount: number | null;
  payplusCount: number | null;
  loading?: boolean;
  onSelect: (side: InventorySource) => void;
};

const allChartConfig = {
  ceir: {
    label: "CEIR",
    color: "var(--chart-1)",
  },
  payplus: {
    label: "PayPlus",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const ceirChartConfig = {
  ceir: {
    label: "CEIR",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const payplusChartConfig = {
  payplus: {
    label: "PayPlus",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

function InventoryRadialCard({
  side,
  title,
  description,
  centerValue,
  footer,
  chartConfig,
  chartData,
  bars,
  loading,
  onSelect,
}: {
  side: InventorySource;
  title: string;
  description: string;
  centerValue: string;
  footer: string;
  chartConfig: ChartConfig;
  chartData: Record<string, string | number>[];
  bars: Array<{ dataKey: string; fill: string }>;
  loading?: boolean;
  onSelect: (side: InventorySource) => void;
}) {
  return (
    <div className="inv-aws-card-wrap">
      <button
        type="button"
        onClick={() => onSelect(side)}
        className="inv-aws-card box-border flex min-h-[320px] w-[300px] max-w-full flex-col text-left"
      >
        <div className="inv-aws-body flex flex-1 flex-col">
          <Card className="flex flex-1 flex-col border-0 bg-transparent shadow-none">
            <CardHeader className="items-center px-4 pb-0 pt-4">
              <CardTitle className="text-[20px] font-bold tracking-tight text-[#16191f]">
                {title}
              </CardTitle>
              <CardDescription className="text-center text-[13px] text-[#545b64]">
                {description}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 items-center px-2 pb-0 pt-1">
              <ChartContainer
                config={chartConfig}
                className="mx-auto aspect-square w-full max-w-[220px]"
              >
                <RadialBarChart
                  data={chartData}
                  endAngle={180}
                  innerRadius={70}
                  outerRadius={100}
                >
                  {bars.map((bar) => (
                    <RadialBar
                      key={bar.dataKey}
                      dataKey={bar.dataKey}
                      fill={bar.fill}
                      stackId="a"
                      cornerRadius={5}
                      className="stroke-transparent stroke-2"
                    />
                  ))}
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <PolarRadiusAxis
                    tick={false}
                    tickLine={false}
                    axisLine={false}
                  >
                    <Label
                      content={({ viewBox }) => {
                        if (
                          viewBox &&
                          "cx" in viewBox &&
                          "cy" in viewBox
                        ) {
                          return (
                            <text
                              x={viewBox.cx}
                              y={viewBox.cy}
                              textAnchor="middle"
                            >
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) - 14}
                                className="fill-[#16191f] font-[family-name:var(--font-mono)] text-2xl font-bold"
                              >
                                {loading ? "…" : centerValue}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) + 6}
                                className="fill-[#545b64] text-[12px]"
                              >
                                Files
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
            <CardFooter className="flex-col gap-1 px-4 pb-3 pt-0 text-center text-[12px] text-[#545b64]">
              <p>{footer}</p>
            </CardFooter>
          </Card>

          <div className="inv-aws-footer mt-auto flex items-center justify-between border-t border-[#d5dbdb] px-5 py-3.5">
            <span className="text-[14px] font-bold text-[#16191f]">Open</span>
            <span
              aria-hidden
              className="inv-aws-open text-[16px] text-[#16191f]"
            >
              →
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

export function SourceCards({
  ceirCount,
  payplusCount,
  loading,
  onSelect,
}: SourceCardsProps) {
  const ceir = ceirCount ?? 0;
  const payplus = payplusCount ?? 0;
  const total = ceir + payplus;

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="-ml-2.5 flex flex-wrap items-start" role="list">
      <div role="listitem">
        <InventoryRadialCard
          side="all"
          title="All"
          description="CEIR and PayPlus uploads"
          centerValue={fmt(total)}
          footer={
            loading
              ? "…"
              : `${fmt(ceir)} CEIR · ${fmt(payplus)} PayPlus`
          }
          chartConfig={allChartConfig}
          chartData={[{ period: "inventory", ceir, payplus }]}
          bars={[
            { dataKey: "payplus", fill: "var(--color-payplus)" },
            { dataKey: "ceir", fill: "var(--color-ceir)" },
          ]}
          loading={loading}
          onSelect={onSelect}
        />
      </div>
      <div role="listitem">
        <InventoryRadialCard
          side="ceir"
          title="CEIR"
          description="IMEI registration application uploads."
          centerValue={fmt(ceir)}
          footer={
            loading
              ? "…"
              : `${fmt(ceir)} file${ceir === 1 ? "" : "s"}`
          }
          chartConfig={ceirChartConfig}
          chartData={[{ period: "inventory", ceir }]}
          bars={[{ dataKey: "ceir", fill: "var(--color-ceir)" }]}
          loading={loading}
          onSelect={onSelect}
        />
      </div>
      <div role="listitem">
        <InventoryRadialCard
          side="payplus"
          title="PayPlus"
          description="Payment Hub transaction uploads."
          centerValue={fmt(payplus)}
          footer={
            loading
              ? "…"
              : `${fmt(payplus)} file${payplus === 1 ? "" : "s"}`
          }
          chartConfig={payplusChartConfig}
          chartData={[{ period: "inventory", payplus }]}
          bars={[{ dataKey: "payplus", fill: "var(--color-payplus)" }]}
          loading={loading}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
