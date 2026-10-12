"use client";

import { Spinner } from "@heroui/react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  AnalysisDateRangePicker,
  calendarRangeToPeriodKeys,
  periodKeysToCalendarRange,
  type AnalysisDateRange,
} from "@/components/analysis-date-range-picker";
import { AnalyticsCharts } from "@/components/analytics-charts";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppFeedback } from "@/components/providers/app-feedback";
import {
  DifferencesPanel,
  TotalsPanel,
} from "@/components/results-panel";
import { SummaryStats } from "@/components/summary-stats";
import type { ReconciliationState } from "@/hooks/use-reconciliation";
import type { MismatchCategory } from "@/lib/types";
import {
  exportReconciliationPdf,
  exportReconciliationReport,
  type ExportFormat,
} from "@/lib/export-report";

type AnalysisViewProps = {
  state: ReconciliationState;
  onGoInventory: () => void;
  initialCategory?: MismatchCategory | null;
};

export function AnalysisView({
  state,
  onGoInventory,
  initialCategory = null,
}: AnalysisViewProps) {
  const feedback = useAppFeedback();
  const reportRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const {
    analysisPeriod,
    analysisPeriodEnd,
    analysisPeriodOptions,
    isRunning,
    canAnalyze,
    result,
    comparedAt,
    apiOnline,
    error,
    selectedAnalysisPeriodLabel,
    runReconciliation,
    changeAnalysisPeriodRange,
  } = state;

  const rangeValue = useMemo(() => {
    if (!analysisPeriod || !analysisPeriodEnd) return null;
    return periodKeysToCalendarRange(analysisPeriod, analysisPeriodEnd);
  }, [analysisPeriod, analysisPeriodEnd]);

  function handleRangeChange(next: AnalysisDateRange) {
    const { from, to } = calendarRangeToPeriodKeys(next);
    feedback.info(
      "Analysis range",
      from === to ? from : `${from} → ${to}`,
    );
    void changeAnalysisPeriodRange(from, to);
  }

  async function handleRunAnalysis() {
    if (!canAnalyze) {
      feedback.warning(
        "Cannot run analysis yet",
        "Select a start–end range that covers stored CEIR / PayPlus data in Inventory.",
      );
      return;
    }

    const periodText = selectedAnalysisPeriodLabel ?? "selected range";
    const ok = await feedback.confirm({
      title: "Run analysis?",
      message: `Calculate reconciliation for ${periodText} from stored database rows. A new run will be created for this range.`,
      confirmLabel: "Run analysis",
      cancelLabel: "Cancel",
      tone: "accent",
    });
    if (!ok) return;

    const outcome = await runReconciliation();
    if (outcome.ok) {
      feedback.success(
        "Analysis complete",
        `Results ready for ${periodText}.`,
      );
    } else {
      feedback.error("Analysis failed", outcome.error);
    }
  }

  function openExportDialog() {
    if (!result) {
      feedback.warning(
        "Nothing to export",
        "Run analysis first, then export the report.",
      );
      return;
    }
    setExportOpen(true);
  }

  async function handleExport(format: ExportFormat) {
    if (!result) return;
    setExportOpen(false);
    setIsExporting(true);

    try {
      if (format === "excel") {
        exportReconciliationReport(result, { comparedAt });
        feedback.success(
          "Excel exported",
          `Spreadsheet ready for ${result.periodLabel}.`,
        );
      } else {
        const node = reportRef.current;
        if (!node) {
          throw new Error("Report content is not ready");
        }
        await exportReconciliationPdf(node, result, { comparedAt });
        feedback.success(
          "PDF exported",
          `Report ready for ${result.periodLabel}.`,
        );
      }
    } catch {
      feedback.error(
        "Export failed",
        format === "pdf"
          ? "Could not create the PDF report."
          : "Could not create the Excel report.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  const hasOptions = analysisPeriodOptions.length > 0;
  const busy = isRunning || isExporting;

  return (
    <div className="space-y-4">
      {apiOnline === false ? (
        <section className="app-card border border-[var(--signal)]/30 bg-[var(--signal)]/5 px-4 py-3">
          <p className="text-[13px] font-medium text-[var(--signal)]">
            API is offline
          </p>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Start the API and database before running analysis.
          </p>
        </section>
      ) : null}

      {error ? (
        <section className="app-card border border-[var(--signal)]/30 bg-[var(--signal)]/5 px-4 py-3">
          <p className="text-[13px] font-medium text-[var(--signal)]">{error}</p>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[12px] text-[var(--muted)]">
          Last update:{" "}
          <span className="text-[var(--ink)]">
            {comparedAt
              ? new Date(comparedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "—"}
          </span>
        </p>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            className="app-btn-outline app-btn-sm"
            onClick={onGoInventory}
          >
            Inventory
          </button>
          <button
            type="button"
            className="app-btn-outline app-btn-sm"
            disabled={!result || busy}
            onClick={openExportDialog}
          >
            {isExporting ? (
              <Spinner color="current" size="sm" />
            ) : (
              <Download className="size-3.5" aria-hidden />
            )}
            {isExporting ? "Exporting…" : "Export"}
          </button>
          <button
            type="button"
            className="app-btn-primary app-btn-sm"
            disabled={!canAnalyze || busy}
            onClick={() => void handleRunAnalysis()}
          >
            {isRunning ? <Spinner color="current" size="sm" /> : null}
            {isRunning ? "Analyzing…" : "Run analysis"}
          </button>
          <AnalysisDateRangePicker
            value={rangeValue}
            disabled={!hasOptions || busy}
            onChange={(next) => void handleRangeChange(next)}
          />
        </div>
      </div>

      <div ref={reportRef} className="space-y-4">
        <SummaryStats result={result} />
        <AnalyticsCharts result={result} />

        {result ? (
          <>
            <section className="space-y-2">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">
                Totals
              </h2>
              <TotalsPanel result={result} />
            </section>
            <section className="space-y-2">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">
                Differences
              </h2>
              <DifferencesPanel
                key={initialCategory ?? "all"}
                result={result}
                initialFilter={initialCategory ?? "all"}
              />
            </section>
          </>
        ) : (
          <div className="app-card px-6 py-10 text-center text-[13px] text-[var(--muted)]">
            Run analysis to view totals and differences.
          </div>
        )}
      </div>

      <AlertDialog open={exportOpen} onOpenChange={setExportOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export report</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a format for{" "}
              <span className="font-medium text-foreground">
                {result?.periodLabel ?? "this analysis"}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="flex flex-col items-start gap-1 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-left transition-colors hover:border-[var(--navy)] hover:bg-[#f8fafc]"
              onClick={() => void handleExport("pdf")}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--ink)]">
                <FileText className="size-4 text-[var(--navy)]" />
                PDF
              </span>
              <span className="text-[12px] text-[var(--muted)]">
                Layout like the Analysis page
              </span>
            </button>
            <button
              type="button"
              className="flex flex-col items-start gap-1 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-left transition-colors hover:border-[var(--navy)] hover:bg-[#f8fafc]"
              onClick={() => void handleExport("excel")}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--ink)]">
                <FileSpreadsheet className="size-4 text-[var(--navy)]" />
                Excel
              </span>
              <span className="text-[12px] text-[var(--muted)]">
                Overview, Totals, Differences sheets
              </span>
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
