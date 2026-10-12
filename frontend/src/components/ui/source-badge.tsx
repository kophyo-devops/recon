"use client";

import type { ReportSide } from "@/lib/types";

type SourceBadgeProps = {
  side: ReportSide;
};

export function SourceBadge({ side }: SourceBadgeProps) {
  return (
    <span
      className={`inv-badge ${side === "ceir" ? "is-ceir" : "is-payplus"}`}
    >
      {side === "ceir" ? "CEIR" : "PayPlus"}
    </span>
  );
}
