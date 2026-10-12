"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatPeriodLabel } from "@/lib/period-from-file";

export type PeriodRange = {
  from: string; // YYYY-MM
  to: string; // YYYY-MM
  presetId: string | null;
  label: string;
};

type PeriodRangePickerProps = {
  value: PeriodRange;
  availablePeriods: string[];
  onApply: (range: PeriodRange) => void;
};

type Preset = {
  id: string;
  label: string;
  resolve: (available: string[]) => { from: string; to: string } | null;
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function periodKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parsePeriod(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function lastNMonths(n: number): { from: string; to: string } {
  const now = new Date();
  const to = periodKey(now.getFullYear(), now.getMonth() + 1);
  const fromDate = shiftMonth(now.getFullYear(), now.getMonth() + 1, -(n - 1));
  return { from: periodKey(fromDate.year, fromDate.month), to };
}

function rangeLabel(from: string, to: string, presetId: string | null, presets: Preset[]) {
  if (presetId) {
    const preset = presets.find((item) => item.id === presetId);
    if (preset) return preset.label;
  }
  if (from === to) return formatPeriodLabel(from);
  return `${formatPeriodLabel(from)} – ${formatPeriodLabel(to)}`;
}

const PRESETS: Preset[] = [
  {
    id: "latest",
    label: "Latest period",
    resolve: (available) => {
      const latest = available[0];
      if (!latest) return null;
      return { from: latest, to: latest };
    },
  },
  {
    id: "last-1",
    label: "Last 1 month",
    resolve: () => lastNMonths(1),
  },
  {
    id: "last-3",
    label: "Last 3 months",
    resolve: () => lastNMonths(3),
  },
  {
    id: "last-6",
    label: "Last 6 months",
    resolve: () => lastNMonths(6),
  },
  {
    id: "last-12",
    label: "Last 12 months",
    resolve: () => lastNMonths(12),
  },
  {
    id: "last-24",
    label: "Last 24 months",
    resolve: () => lastNMonths(24),
  },
  {
    id: "all-stored",
    label: "All stored periods",
    resolve: (available) => {
      if (available.length === 0) return null;
      const sorted = [...available].sort();
      return { from: sorted[0], to: sorted[sorted.length - 1] };
    },
  },
];

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function monthGrid(year: number, month: number) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const total = daysInMonth(year, month);
  const cells: Array<{ day: number; inMonth: boolean; key: string }> = [];

  const prev = shiftMonth(year, month, -1);
  const prevDays = daysInMonth(prev.year, prev.month);
  for (let i = firstDow - 1; i >= 0; i -= 1) {
    const day = prevDays - i;
    cells.push({
      day,
      inMonth: false,
      key: `${prev.year}-${prev.month}-${day}`,
    });
  }
  for (let day = 1; day <= total; day += 1) {
    cells.push({ day, inMonth: true, key: `${year}-${month}-${day}` });
  }
  const next = shiftMonth(year, month, 1);
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({
      day: nextDay,
      inMonth: false,
      key: `${next.year}-${next.month}-${nextDay}`,
    });
    nextDay += 1;
  }
  return cells;
}

export function PeriodRangePicker({
  value,
  availablePeriods,
  onApply,
}: PeriodRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);
  const [draftPreset, setDraftPreset] = useState<string | null>(value.presetId);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const fromParts = parsePeriod(draftFrom) ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  };
  const [viewYear, setViewYear] = useState(fromParts.year);
  const [viewMonth, setViewMonth] = useState(fromParts.month);

  useEffect(() => {
    if (!open) return;
    setDraftFrom(value.from);
    setDraftTo(value.to);
    setDraftPreset(value.presetId);
    const parsed = parsePeriod(value.from);
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
    setQuery("");
  }, [open, value.from, value.to, value.presetId]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filteredPresets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PRESETS;
    return PRESETS.filter((preset) => preset.label.toLowerCase().includes(q));
  }, [query]);

  const cells = useMemo(
    () => monthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  function selectPreset(preset: Preset) {
    const resolved = preset.resolve(availablePeriods);
    if (!resolved) return;
    setDraftFrom(resolved.from);
    setDraftTo(resolved.to);
    setDraftPreset(preset.id);
    const parsed = parsePeriod(resolved.from);
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  }

  function selectMonthFromCalendar(year: number, month: number) {
    const key = periodKey(year, month);
    if (!draftFrom || (draftFrom && draftTo && draftFrom !== draftTo)) {
      setDraftFrom(key);
      setDraftTo(key);
      setDraftPreset(null);
      return;
    }
    if (key < draftFrom) {
      setDraftFrom(key);
      setDraftTo(draftFrom);
    } else {
      setDraftTo(key);
    }
    setDraftPreset(null);
  }

  function apply() {
    const from = parsePeriod(draftFrom);
    const to = parsePeriod(draftTo);
    if (!from || !to) return;
    let nextFrom = draftFrom;
    let nextTo = draftTo;
    if (nextFrom > nextTo) {
      nextFrom = draftTo;
      nextTo = draftFrom;
    }
    onApply({
      from: nextFrom,
      to: nextTo,
      presetId: draftPreset,
      label: rangeLabel(nextFrom, nextTo, draftPreset, PRESETS),
    });
    setOpen(false);
  }

  const selectedFrom = parsePeriod(draftFrom);
  const selectedTo = parsePeriod(draftTo);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--field-border)] bg-white px-3 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--field-border-hover)]"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <CalendarDays className="size-4 text-[var(--muted)]" aria-hidden />
        {value.label}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,560px)] overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-[0_12px_40px_rgba(15,27,48,0.16)]">
          <div className="border-b border-[var(--line-soft)] px-3 py-2.5">
            <input
              className="app-field h-9 text-[13px]"
              placeholder="Search presets: last 3, latest…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="grid gap-0 sm:grid-cols-[1fr_180px]">
            <div className="border-b border-[var(--line-soft)] p-3 sm:border-b-0 sm:border-r">
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  className="rounded p-1 text-[var(--muted)] hover:bg-[#f3f6f9] hover:text-[var(--ink)]"
                  onClick={() => {
                    const prev = shiftMonth(viewYear, viewMonth, -1);
                    setViewYear(prev.year);
                    setViewMonth(prev.month);
                  }}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <p className="text-[13px] font-semibold text-[var(--ink)]">
                  {MONTH_LABELS[viewMonth - 1]} {viewYear}
                </p>
                <button
                  type="button"
                  className="rounded p-1 text-[var(--muted)] hover:bg-[#f3f6f9] hover:text-[var(--ink)]"
                  onClick={() => {
                    const next = shiftMonth(viewYear, viewMonth, 1);
                    setViewYear(next.year);
                    setViewMonth(next.month);
                  }}
                  aria-label="Next month"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-y-1 text-center">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="py-1 text-[11px] font-medium text-[var(--muted)]"
                  >
                    {day}
                  </div>
                ))}
                {cells.map((cell) => {
                  const key = periodKey(viewYear, viewMonth);
                  const isCurrentMonthCell = cell.inMonth;
                  const periodOfCell = isCurrentMonthCell
                    ? key
                    : null;
                  const inRange =
                    periodOfCell &&
                    selectedFrom &&
                    selectedTo &&
                    periodOfCell >= draftFrom &&
                    periodOfCell <= draftTo;
                  const isEdge =
                    periodOfCell === draftFrom || periodOfCell === draftTo;

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      disabled={!isCurrentMonthCell}
                      onClick={() => {
                        if (!isCurrentMonthCell) return;
                        selectMonthFromCalendar(viewYear, viewMonth);
                      }}
                      className={`mx-auto flex size-8 items-center justify-center rounded-full text-[12px] ${
                        !isCurrentMonthCell
                          ? "text-[#c1cad4]"
                          : isEdge
                            ? "bg-[var(--navy)] font-semibold text-white"
                            : inRange
                              ? "bg-[#e8eef6] font-medium text-[var(--ink)]"
                              : "text-[var(--ink)] hover:bg-[#f3f6f9]"
                      }`}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                Click a month day to set start/end period (
                {MONTH_LABELS[viewMonth - 1]} {viewYear}).
              </p>
            </div>

            <div className="max-h-[260px] overflow-y-auto border-b border-[var(--line-soft)] p-2 sm:border-b-0">
              {filteredPresets.map((preset) => {
                const disabled = preset.resolve(availablePeriods) == null;
                const active = draftPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectPreset(preset)}
                    className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-[13px] ${
                      active
                        ? "bg-[#eef2f6] font-medium text-[var(--ink)]"
                        : disabled
                          ? "cursor-not-allowed text-[#b0bac6]"
                          : "text-[var(--ink)] hover:bg-[#f5f7fa]"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 border-t border-[var(--line-soft)] px-3 py-3 sm:grid-cols-2">
            <label className="block text-[12px] text-[var(--muted)]">
              Start
              <span className="mt-1 flex h-9 items-center gap-2 rounded-md border border-[var(--field-border)] bg-white px-2.5">
                <CalendarDays className="size-3.5 text-[var(--muted)]" />
                <input
                  className="w-full border-0 bg-transparent text-[13px] text-[var(--ink)] outline-none"
                  value={draftFrom}
                  placeholder="YYYY-MM"
                  onChange={(e) => {
                    setDraftFrom(e.target.value);
                    setDraftPreset(null);
                  }}
                />
              </span>
            </label>
            <label className="block text-[12px] text-[var(--muted)]">
              End
              <span className="mt-1 flex h-9 items-center gap-2 rounded-md border border-[var(--field-border)] bg-white px-2.5">
                <CalendarDays className="size-3.5 text-[var(--muted)]" />
                <input
                  className="w-full border-0 bg-transparent text-[13px] text-[var(--ink)] outline-none"
                  value={draftTo}
                  placeholder="YYYY-MM"
                  onChange={(e) => {
                    setDraftTo(e.target.value);
                    setDraftPreset(null);
                  }}
                />
              </span>
            </label>
          </div>

          <div className="flex justify-end border-t border-[var(--line-soft)] px-3 py-2.5">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md bg-[#2c7be5] px-4 text-[13px] font-semibold text-white hover:bg-[#2169c9]"
              onClick={apply}
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function defaultPeriodRange(availablePeriods: string[]): PeriodRange {
  if (availablePeriods.length === 0) {
    const fallback = lastNMonths(1);
    return {
      from: fallback.from,
      to: fallback.to,
      presetId: "last-1",
      label: "Last 1 month",
    };
  }

  const sorted = [...availablePeriods].sort();
  if (sorted.length === 1) {
    return {
      from: sorted[0],
      to: sorted[0],
      presetId: "latest",
      label: "Latest period",
    };
  }

  // After inventory uploads, show every stored period so dashboard totals update.
  return {
    from: sorted[0],
    to: sorted[sorted.length - 1],
    presetId: "all-stored",
    label: "All stored periods",
  };
}
