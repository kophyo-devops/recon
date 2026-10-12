"use client";

import type { PeriodOption } from "@/lib/period-from-file";

type PeriodSelectProps = {
  options: PeriodOption[];
  value: string | null;
  isLoading?: boolean;
  onChange: (value: string | null) => void;
};

export function PeriodSelect({
  options,
  value,
  isLoading = false,
  onChange,
}: PeriodSelectProps) {
  const hasOptions = options.length > 0;

  return (
    <div className="w-full max-w-[280px]">
      <label
        htmlFor="period-select"
        className="mb-1 block text-[12px] font-semibold text-[var(--ink)]"
      >
        Period
      </label>
      <select
        id="period-select"
        className="app-field"
        disabled={!hasOptions || isLoading}
        value={value ?? ""}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next ? next : null);
        }}
      >
        <option value="">
          {isLoading
            ? "Reading…"
            : hasOptions
              ? "Select period"
              : "No periods yet"}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
