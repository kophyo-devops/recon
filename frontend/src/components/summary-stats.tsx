"use client";

import { formatMmk } from "@/lib/format";
import type { ReconciliationResult } from "@/lib/types";

type SummaryStatsProps = {
  result: ReconciliationResult | null;
};

export function SummaryStats({ result }: SummaryStatsProps) {
  const items = [
    { label: "Period", value: result?.periodLabel ?? "—" },
    {
      label: "Paid (HUB / CEIR)",
      value: result
        ? `${result.irdPaid.toLocaleString()} / ${result.ceirPaid.toLocaleString()}`
        : "—",
    },
    {
      label: "Exceptions",
      value: result
        ? `${result.mismatchCount} · ${result.matchedCount.toLocaleString()} matched`
        : "—",
    },
    {
      label: "Adjusted sum",
      value: result
        ? `${formatMmk(result.adjustedIrdSum)} MMK${
            result.sumsEqual ? " · equal" : ""
          }`
        : "—",
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[10px] border border-[#c5d0db] bg-white px-4 py-3"
        >
          <dt className="text-[12px] text-[var(--muted)]">{item.label}</dt>
          <dd className="mt-1 font-[family-name:var(--font-mono)] text-[13px] text-[var(--ink)]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
