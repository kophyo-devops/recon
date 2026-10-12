"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDate,
  getLocalTimeZone,
  today,
} from "@internationalized/date";

export type AnalysisDateRange = {
  start: CalendarDate;
  end: CalendarDate;
};

type AnalysisDateRangePickerProps = {
  value: AnalysisDateRange | null;
  onChange: (range: AnalysisDateRange) => void;
  disabled?: boolean;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
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

function shiftMonth(date: CalendarDate, delta: number): CalendarDate {
  return date.add({ months: delta }).set({ day: 1 });
}

function formatShort(date: CalendarDate): string {
  const month = MONTH_LABELS[date.month - 1]?.slice(0, 3) ?? String(date.month);
  return `${month} ${String(date.day).padStart(2, "0")}, ${date.year}`;
}

function sameDay(a: CalendarDate, b: CalendarDate) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function compareDay(a: CalendarDate, b: CalendarDate) {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function inRange(day: CalendarDate, start: CalendarDate, end: CalendarDate) {
  return compareDay(day, start) >= 0 && compareDay(day, end) <= 0;
}

function monthCells(year: number, month: number) {
  const first = new CalendarDate(year, month, 1);
  const firstDow = first.toDate(getLocalTimeZone()).getDay();
  const daysInMonth = first.add({ months: 1 }).subtract({ days: 1 }).day;
  const cells: Array<{ date: CalendarDate | null; label: number }> = [];

  const prev = first.subtract({ months: 1 });
  const prevDays = prev.add({ months: 1 }).subtract({ days: 1 }).day;
  for (let i = firstDow - 1; i >= 0; i -= 1) {
    cells.push({
      date: null,
      label: prevDays - i,
    });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new CalendarDate(year, month, day), label: day });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, label: nextDay });
    nextDay += 1;
  }
  return cells;
}

function MonthGrid({
  year,
  month,
  draftStart,
  draftEnd,
  onPick,
}: {
  year: number;
  month: number;
  draftStart: CalendarDate | null;
  draftEnd: CalendarDate | null;
  onPick: (date: CalendarDate) => void;
}) {
  const cells = useMemo(() => monthCells(year, month), [year, month]);

  return (
    <div className="w-[240px]">
      <p className="mb-2 text-center text-[13px] font-semibold text-[var(--ink)]">
        {MONTH_LABELS[month - 1]} {year}
      </p>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-1 text-[11px] font-medium text-[var(--muted)]"
          >
            {day}
          </div>
        ))}
        {cells.map((cell, index) => {
          if (!cell.date) {
            return (
              <div
                key={`pad-${index}`}
                className="flex size-8 items-center justify-center text-[12px] text-[#c1cad4]"
              >
                {cell.label}
              </div>
            );
          }
          const isStart = draftStart ? sameDay(cell.date, draftStart) : false;
          const isEnd = draftEnd ? sameDay(cell.date, draftEnd) : false;
          const isEdge = isStart || isEnd;
          const selected =
            draftStart &&
            draftEnd &&
            inRange(cell.date, draftStart, draftEnd);

          return (
            <button
              key={cell.date.toString()}
              type="button"
              onClick={() => onPick(cell.date!)}
              className={`mx-auto flex size-8 items-center justify-center rounded-full text-[12px] ${
                isEdge
                  ? "bg-[var(--navy)] font-semibold text-white"
                  : selected
                    ? "bg-[#e8eef6] font-medium text-[var(--ink)]"
                    : "text-[var(--ink)] hover:bg-[#f3f6f9]"
              }`}
            >
              {cell.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AnalysisDateRangePicker({
  value,
  onChange,
  disabled = false,
}: AnalysisDateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initial = value?.start ?? today(getLocalTimeZone());
  const [viewLeft, setViewLeft] = useState(() =>
    initial.set({ day: 1 }),
  );
  const [draftStart, setDraftStart] = useState<CalendarDate | null>(
    value?.start ?? null,
  );
  const [draftEnd, setDraftEnd] = useState<CalendarDate | null>(
    value?.end ?? null,
  );

  useEffect(() => {
    if (!open) return;
    setDraftStart(value?.start ?? null);
    setDraftEnd(value?.end ?? null);
    if (value?.start) {
      setViewLeft(value.start.set({ day: 1 }));
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  const viewRight = shiftMonth(viewLeft, 1);

  function pick(date: CalendarDate) {
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(date);
      setDraftEnd(null);
      return;
    }
    if (compareDay(date, draftStart) < 0) {
      setDraftEnd(draftStart);
      setDraftStart(date);
      return;
    }
    setDraftEnd(date);
  }

  function apply() {
    if (!draftStart || !draftEnd) return;
    onChange({ start: draftStart, end: draftEnd });
    setOpen(false);
  }

  const label =
    value != null
      ? `${formatShort(value.start)} - ${formatShort(value.end)}`
      : "Select period range";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-9 min-w-[240px] items-center gap-2 rounded-md border border-[var(--field-border)] bg-white px-3 text-left text-[13px] text-[var(--ink)] hover:border-[var(--field-border-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        aria-expanded={open}
      >
        <CalendarDays className="size-4 shrink-0 text-[var(--muted)]" />
        <span className="truncate">{label}</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,560px)] rounded-lg border border-[var(--line)] bg-white p-4 shadow-[0_12px_40px_rgba(15,27,48,0.16)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded p-1 text-[var(--muted)] hover:bg-[#f3f6f9] hover:text-[var(--ink)]"
              onClick={() => setViewLeft((prev) => shiftMonth(prev, -1))}
              aria-label="Previous month"
            >
              ‹
            </button>
            <p className="text-[12px] text-[var(--muted)]">
              Pick start date, then end date
            </p>
            <button
              type="button"
              className="rounded p-1 text-[var(--muted)] hover:bg-[#f3f6f9] hover:text-[var(--ink)]"
              onClick={() => setViewLeft((prev) => shiftMonth(prev, 1))}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-8">
            <MonthGrid
              year={viewLeft.year}
              month={viewLeft.month}
              draftStart={draftStart}
              draftEnd={draftEnd}
              onPick={pick}
            />
            <MonthGrid
              year={viewRight.year}
              month={viewRight.month}
              draftStart={draftStart}
              draftEnd={draftEnd}
              onPick={pick}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--line-soft)] pt-3">
            <p className="text-[12px] text-[var(--muted)]">
              {draftStart && draftEnd
                ? `${formatShort(draftStart)} - ${formatShort(draftEnd)}`
                : draftStart
                  ? `${formatShort(draftStart)} - …`
                  : "No range selected"}
            </p>
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-md bg-[#2c7be5] px-4 text-[13px] font-semibold text-white hover:bg-[#2169c9] disabled:opacity-50"
              disabled={!draftStart || !draftEnd}
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

export function calendarRangeToPeriodKeys(range: AnalysisDateRange): {
  from: string;
  to: string;
} {
  const from = `${range.start.year}-${String(range.start.month).padStart(2, "0")}`;
  const to = `${range.end.year}-${String(range.end.month).padStart(2, "0")}`;
  return from <= to ? { from, to } : { from: to, to: from };
}

export function periodKeysToCalendarRange(
  from: string,
  to: string,
): AnalysisDateRange | null {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return new CalendarDate(year, month, 1);
  };
  const start = parse(from);
  const endRaw = parse(to);
  if (!start || !endRaw) return null;
  const end = endRaw.add({ months: 1 }).subtract({ days: 1 });
  return { start, end };
}
