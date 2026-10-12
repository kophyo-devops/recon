import type { ReconciliationResult } from "./types";

/** UI preview data shaped like April 2026 Difference_by_JSC notes. */
export const mockReconciliation: ReconciliationResult = {
  periodLabel: "April 2026",
  matchedCount: 4711,
  mismatchCount: 2,
  irdPaid: 4713,
  ceirPaid: 4711,
  adjustedIrdSum: 1_496_856_961,
  adjustedCeirSum: 1_496_856_961,
  sumsEqual: true,
  summary: [
    {
      label: "Records in reports",
      ird: 5367,
      ceir: 5404,
      note: "Some HUB rows share one CEIR Application ID",
    },
    {
      label: "Fraud applications",
      ird: 654,
      ceir: 693,
      note: "Fraud confirmations reach CEIR even when HUB deletes rows",
    },
    {
      label: "Successful / paid applications",
      ird: 4713,
      ceir: 4711,
      note: "Difference: MM-CR-FR83HPG, MM-CR-D4GA46L",
    },
    {
      label: "Tax in records (MMK)",
      ird: "1,498,849,138.25",
      ceir: "1,503,465,610.25",
    },
    {
      label: "Adjusted paid sum (MMK)",
      ird: "1,496,856,961",
      ceir: "1,496,856,961",
      note: "After fraud, unconfirmed, and overpay adjustments",
    },
  ],
  mismatches: [
    {
      id: "1",
      applicationId: "MM-CR-FR83HPG",
      category: "unconfirmed",
      amountMmk: null,
      irdStatus: "API status 99",
      ceirStatus: "Not confirmed",
      detail:
        "IRD Tax Payment HUB API returns exception: Source array was not long enough.",
    },
    {
      id: "2",
      applicationId: "MM-CR-D4GA46L",
      category: "month_boundary",
      amountMmk: 244_283,
      irdStatus: "Raw payment_dt in April",
      ceirStatus: "Confirmed in May",
      detail:
        "API returns txnDate 5/26/2026 — counted in May CEIR report, not April.",
    },
    {
      id: "3",
      applicationId: "MM-CR-W7TEE3Y",
      category: "overpay",
      amountMmk: 2500,
      irdStatus: "890,060 MMK",
      ceirStatus: "887,560 MMK",
      detail: "HUB tax sum is higher than the payment confirmation sent to CEIR.",
    },
    {
      id: "4",
      applicationId: "Multiple fraud IDs",
      category: "fraud",
      amountMmk: null,
      irdStatus: "654 records",
      ceirStatus: "693 records",
      detail:
        "PayPlus deleted some fraud rows in HUB; all confirmations were still sent to CEIR.",
    },
    {
      id: "5",
      applicationId: "Duplicate payment rows",
      category: "duplicate",
      amountMmk: null,
      irdStatus: "Row-level count",
      ceirStatus: "Unique Application ID",
      detail:
        "One CEIR Application ID can appear as multiple Payment Hub transactions.",
    },
  ],
};

export const categoryLabels: Record<
  ReconciliationResult["mismatches"][number]["category"],
  string
> = {
  unconfirmed: "Unconfirmed",
  fraud: "Fraud mismatch",
  duplicate: "Duplicate payment",
  overpay: "Overpay",
  month_boundary: "Month boundary",
};
