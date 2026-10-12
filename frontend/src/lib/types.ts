export type ReportSide = "ceir" | "payplus";

export type MismatchCategory =
  | "unconfirmed"
  | "fraud"
  | "duplicate"
  | "overpay"
  | "month_boundary";

export type UploadedFile = {
  id: string;
  name: string;
  size: number;
  side: ReportSide;
  periods: string[];
};

export type SummaryMetric = {
  label: string;
  ird: number | string;
  ceir: number | string;
  note?: string;
};

export type MismatchRow = {
  id: string;
  applicationId: string;
  category: MismatchCategory;
  amountMmk: number | null;
  irdStatus: string;
  ceirStatus: string;
  detail: string;
};

export type ReconciliationResult = {
  periodLabel: string;
  matchedCount: number;
  mismatchCount: number;
  irdPaid: number;
  ceirPaid: number;
  adjustedIrdSum: number;
  adjustedCeirSum: number;
  sumsEqual: boolean;
  summary: SummaryMetric[];
  mismatches: MismatchRow[];
};
