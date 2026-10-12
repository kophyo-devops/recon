import * as XLSX from "xlsx";

export type PeriodOption = {
  value: string; // YYYY-MM
  label: string;
};

/** CEIR / Payment Hub reports are not older than this. */
const MIN_YEAR = 2020;

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
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
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

const DATE_HEADER_RE =
  /^(date|transaction_date_time|date_of_pay|payment_dt|txn_date|txndate|confirmed_dt|paid.?date|application.?date)$/i;

const MONTH_HEADER_RE = /^(tax_period|period|month)$/i;

function maxYear(): number {
  return new Date().getFullYear() + 1;
}

export function formatPeriodLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return value;
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

function periodKey(year: number, month: number): string | null {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > maxYear()) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function addPeriod(target: Set<string>, year: number, month: number) {
  const key = periodKey(year, month);
  if (key) target.add(key);
}

function excelYearMonth(date: Date): { year: number; month: number } {
  let cursor = date;

  // SheetJS whole-day serials often land at 23:59:13 local on the previous
  // calendar day (e.g. 2026-09-01 -> Aug 31 23:59:13). Snap those forward.
  // Real payment timestamps (23:19, 23:38, etc.) are left unchanged.
  if (
    cursor.getHours() === 23 &&
    cursor.getMinutes() === 59 &&
    cursor.getSeconds() === 13
  ) {
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
    );
  }

  return { year: cursor.getFullYear(), month: cursor.getMonth() + 1 };
}

function collectFromDate(target: Set<string>, years: Set<number>, date: Date) {
  if (Number.isNaN(date.getTime())) return;
  const { year, month } = excelYearMonth(date);
  if (year < MIN_YEAR || year > maxYear()) return;
  addPeriod(target, year, month);
  years.add(year);
}

/**
 * Only parse strings that clearly look like dates.
 * Do NOT treat money amounts / IDs as Excel serial dates.
 */
function collectFromDateString(
  target: Set<string>,
  years: Set<number>,
  raw: string,
) {
  const text = raw.trim();
  if (!text) return;

  // 2026-09-08 / 2026/09/08
  let match = text.match(/^(20\d{2})[-/.](\d{1,2})(?:[-/.]\d{1,2})(?:[ T].*)?$/);
  if (match) {
    addPeriod(target, Number(match[1]), Number(match[2]));
    years.add(Number(match[1]));
    return;
  }

  // 04.09.2026 / 8/9/2026 (day.month.year — CEIR style)
  match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](20\d{2})$/);
  if (match) {
    const year = Number(match[3]);
    const month = Number(match[2]);
    addPeriod(target, year, month);
    years.add(year);
    return;
  }

  // August 2026 / Aug-2026
  match = text.match(
    /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[,\s_-]+(20\d{2})$/i,
  );
  if (match) {
    const month = MONTH_NAME_TO_NUM[match[1].toLowerCase()];
    const year = Number(match[2]);
    if (month) {
      addPeriod(target, year, month);
      years.add(year);
    }
  }
}

function collectLoneMonth(loneMonths: Set<number>, raw: string) {
  const match = raw
    .trim()
    .match(
      /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*$/i,
    );
  if (!match) return;
  const month = MONTH_NAME_TO_NUM[match[1].toLowerCase()];
  if (month) loneMonths.add(month);
}

function headerName(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "")
    .toLowerCase();
}

function collectFromFilename(target: Set<string>, years: Set<number>, name: string) {
  // Application to IMEI Registration List_2026_9_Auction.xlsx
  const match = name.match(/(20\d{2})[_-](\d{1,2})(?!\d)/);
  if (match) {
    addPeriod(target, Number(match[1]), Number(match[2]));
    years.add(Number(match[1]));
  }
}

export async function extractPeriodsFromFile(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
  });

  const periods = new Set<string>();
  const loneMonths = new Set<number>();
  const years = new Set<number>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | Date | boolean | null)[]>(
      sheet,
      {
        header: 1,
        defval: null,
        raw: true,
      },
    );

    if (rows.length === 0) continue;

    // Find header row: first row that contains a known date/period column name
    let headerRowIndex = -1;
    let dateCols = new Set<number>();
    let monthCols = new Set<number>();

    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const nextDateCols = new Set<number>();
      const nextMonthCols = new Set<number>();
      row.forEach((cell, index) => {
        const name = headerName(cell);
        if (DATE_HEADER_RE.test(name) || name === "date") nextDateCols.add(index);
        if (MONTH_HEADER_RE.test(name)) nextMonthCols.add(index);
        // CEIR report header label "Date"
        if (String(cell ?? "").trim().toLowerCase() === "date") {
          nextDateCols.add(index);
        }
      });
      if (nextDateCols.size > 0 || nextMonthCols.size > 0) {
        headerRowIndex = r;
        dateCols = nextDateCols;
        monthCols = nextMonthCols;
        break;
      }
    }

    if (headerRowIndex >= 0) {
      for (let r = headerRowIndex + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!Array.isArray(row)) continue;

        for (const col of dateCols) {
          const cell = row[col];
          if (cell instanceof Date) {
            collectFromDate(periods, years, cell);
          } else if (typeof cell === "string") {
            collectFromDateString(periods, years, cell);
          }
          // Intentionally ignore bare numbers — amounts are not dates
        }

        for (const col of monthCols) {
          const cell = row[col];
          if (typeof cell === "string") collectLoneMonth(loneMonths, cell);
        }
      }
    } else {
      // No clear headers: only accept real Date objects or unambiguous date strings
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          if (cell instanceof Date) {
            collectFromDate(periods, years, cell);
          } else if (typeof cell === "string") {
            collectFromDateString(periods, years, cell);
            collectLoneMonth(loneMonths, cell);
          }
        }
      }
    }
  }

  if (loneMonths.size > 0 && years.size > 0) {
    for (const month of loneMonths) {
      for (const year of years) {
        addPeriod(periods, year, month);
      }
    }
  }

  if (periods.size === 0) {
    collectFromFilename(periods, years, file.name);
  }

  return [...periods].sort();
}

export function toPeriodOptions(values: string[]): PeriodOption[] {
  return values
    .slice()
    .sort()
    .reverse()
    .map((value) => ({
      value,
      label: formatPeriodLabel(value),
    }));
}

/** Calendar months available for storing inventory (newest first). */
export function recentPeriodValues(count = 36): string[] {
  const values: string[] = [];
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  for (let i = 0; i < count; i += 1) {
    const key = periodKey(year, month);
    if (key) values.push(key);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    if (year < MIN_YEAR) break;
  }
  return values;
}

export function mergePeriodValues(groups: string[][]): string[] {
  const set = new Set<string>();
  for (const group of groups) {
    for (const value of group) set.add(value);
  }
  return [...set].sort().reverse();
}
