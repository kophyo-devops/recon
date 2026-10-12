"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ApiError,
  fetchHealth,
  fetchLatestReconciliation,
  fetchPeriods,
  fetchUploadBatches,
  runReconciliationApi,
  uploadReportFile,
} from "@/lib/api";
import {
  extractPeriodsFromFile,
  formatPeriodLabel,
  mergePeriodValues,
  recentPeriodValues,
  toPeriodOptions,
} from "@/lib/period-from-file";
import type { ReconciliationResult, ReportSide, UploadedFile } from "@/lib/types";

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type AnalysisStatus = "empty" | "ready" | "analyzed";

type LocalFile = UploadedFile & {
  file?: File;
  serverBatchId?: string;
  serverRowCount?: number;
};

function mapResult(apiResult: {
  periodLabel: string;
  matchedCount: number;
  mismatchCount: number;
  irdPaid: number;
  ceirPaid: number;
  adjustedIrdSum: number;
  adjustedCeirSum: number;
  sumsEqual: boolean;
  summary: ReconciliationResult["summary"];
  mismatches: ReconciliationResult["mismatches"];
  createdAt?: string;
}): ReconciliationResult {
  return {
    periodLabel: apiResult.periodLabel,
    matchedCount: apiResult.matchedCount,
    mismatchCount: apiResult.mismatchCount,
    irdPaid: apiResult.irdPaid,
    ceirPaid: apiResult.ceirPaid,
    adjustedIrdSum: apiResult.adjustedIrdSum,
    adjustedCeirSum: apiResult.adjustedCeirSum,
    sumsEqual: apiResult.sumsEqual,
    summary: apiResult.summary,
    mismatches: apiResult.mismatches,
  };
}

export function useReconciliation() {
  const [ceirFiles, setCeirFiles] = useState<LocalFile[]>([]);
  const [payplusFiles, setPayplusFiles] = useState<LocalFile[]>([]);
  const [apiPeriodValues, setApiPeriodValues] = useState<string[]>([]);
  /** Start period (YYYY-MM) for analysis / reconciliation runs. */
  const [analysisPeriod, setAnalysisPeriod] = useState<string | null>(null);
  /** End period (YYYY-MM), inclusive. Null means same as start. */
  const [analysisPeriodEnd, setAnalysisPeriodEnd] = useState<string | null>(
    null,
  );
  const [isReadingPeriods, setIsReadingPeriods] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [comparedAt, setComparedAt] = useState<string | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inventoryCounts, setInventoryCounts] = useState({
    ceir: 0,
    payplus: 0,
  });
  /** Bumps whenever inventory periods/files change so Dashboard can reload charts. */
  const [inventoryVersion, setInventoryVersion] = useState(0);

  const periodOptions = useMemo(() => {
    const values = mergePeriodValues([
      recentPeriodValues(36),
      apiPeriodValues,
      ...ceirFiles.map((file) => file.periods),
      ...payplusFiles.map((file) => file.periods),
    ]);
    return toPeriodOptions(values);
  }, [apiPeriodValues, ceirFiles, payplusFiles]);

  const analysisPeriodOptions = useMemo(
    () => toPeriodOptions(apiPeriodValues),
    [apiPeriodValues],
  );

  async function refreshInventoryCounts() {
    try {
      const [ceir, payplus] = await Promise.all([
        fetchUploadBatches({ side: "ceir", page: 1, pageSize: 1 }),
        fetchUploadBatches({ side: "payplus", page: 1, pageSize: 1 }),
      ]);
      const next = { ceir: ceir.total, payplus: payplus.total };
      setInventoryCounts(next);
      return next;
    } catch {
      setInventoryCounts({ ceir: 0, payplus: 0 });
      return { ceir: 0, payplus: 0 };
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const health = await fetchHealth();
        if (cancelled) return;
        setApiOnline(health.database === "connected");

        const [periods, counts] = await Promise.all([
          fetchPeriods(),
          refreshInventoryCounts(),
        ]);
        if (cancelled) return;

        const values = periods.map((item) => item.value);
        setApiPeriodValues(values);
        setInventoryVersion((n) => n + 1);
        setError(null);

        const hasInventory = counts.ceir + counts.payplus > 0;
        if (!hasInventory || values.length === 0) {
          setHasResult(false);
          setComparedAt(null);
          setResult(null);
          setAnalysisPeriod(null);
          setAnalysisPeriodEnd(null);
          return;
        }

        if (values.length === 1) {
          setAnalysisPeriod((prev) => prev ?? values[0]);
          setAnalysisPeriodEnd((prev) => prev ?? values[0]);
        }

        try {
          const latest = await fetchLatestReconciliation();
          if (cancelled || !latest) return;
          setResult(mapResult(latest));
          setHasResult(true);
          setComparedAt(latest.createdAt || null);
          const match = periods.find((p) => p.label === latest.periodLabel);
          if (match) {
            setAnalysisPeriod((prev) => prev ?? match.value);
            setAnalysisPeriodEnd((prev) => prev ?? match.value);
          }
        } catch {
          // no prior run
        }
      } catch {
        if (!cancelled) {
          setApiOnline(false);
          setError(
            "Cannot reach API. Start backend (port 8000) and database, then refresh.",
          );
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!analysisPeriod) return;
    if (
      !analysisPeriodOptions.some((option) => option.value === analysisPeriod)
    ) {
      setAnalysisPeriod(null);
      setAnalysisPeriodEnd(null);
    }
  }, [analysisPeriod, analysisPeriodOptions]);

  const effectivePeriodEnd = analysisPeriodEnd ?? analysisPeriod;

  const rangeTouchesInventory = Boolean(
    analysisPeriod &&
      effectivePeriodEnd &&
      apiPeriodValues.some(
        (value) => value >= analysisPeriod && value <= effectivePeriodEnd,
      ),
  );

  const canAnalyze =
    Boolean(analysisPeriod && effectivePeriodEnd) &&
    !isRunning &&
    apiOnline !== false &&
    rangeTouchesInventory;

  const status: AnalysisStatus = !hasResult
    ? rangeTouchesInventory
      ? "ready"
      : "empty"
    : "analyzed";

  async function refreshPeriods() {
    try {
      const [periods, counts] = await Promise.all([
        fetchPeriods(),
        refreshInventoryCounts(),
      ]);
      const values = periods.map((item) => item.value);
      setApiPeriodValues(values);
      setApiOnline(true);
      setInventoryVersion((n) => n + 1);

      if (counts.ceir + counts.payplus === 0 || values.length === 0) {
        setHasResult(false);
        setComparedAt(null);
        setResult(null);
        setAnalysisPeriod(null);
        setAnalysisPeriodEnd(null);
      }
    } catch {
      // keep current list if refresh fails
    }
  }

  async function addFiles(
    side: ReportSide,
    list: FileList | null,
  ): Promise<
    | { ok: true; count: number; period: string | null }
    | { ok: false; error: string }
  > {
    if (!list?.length) return { ok: false, error: "No files selected." };
    if (apiOnline === false) {
      return { ok: false, error: "API is offline. Start the backend first." };
    }

    const fallbackPeriod = recentPeriodValues(1)[0];
    if (!fallbackPeriod) {
      return { ok: false, error: "Could not determine upload period." };
    }

    setIsReadingPeriods(true);
    setIsUploading(true);
    setError(null);

    try {
      const parsed: LocalFile[] = await Promise.all(
        Array.from(list).map(async (file) => ({
          id: makeId(),
          name: file.name,
          size: file.size,
          side,
          periods: await extractPeriodsFromFile(file),
          file,
        })),
      );

      const uploaded: LocalFile[] = [];
      let lastPeriod: string | null = null;
      for (const item of parsed) {
        if (!item.file) continue;
        const period = item.periods[0] ?? fallbackPeriod;
        const saved = await uploadReportFile(side, period, item.file);
        lastPeriod = saved.periodKey || period;
        uploaded.push({
          ...item,
          periods: item.periods.length > 0 ? item.periods : [period],
          serverBatchId: saved.batchId,
          serverRowCount: saved.rowCount,
        });
      }

      if (side === "ceir") setCeirFiles((prev) => [...prev, ...uploaded]);
      else setPayplusFiles((prev) => [...prev, ...uploaded]);

      await refreshPeriods();
      return { ok: true, count: uploaded.length, period: lastPeriod };
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to store files";
      setError(message);
      return { ok: false, error: message };
    } finally {
      setIsReadingPeriods(false);
      setIsUploading(false);
    }
  }

  function removeFile(side: ReportSide, id: string) {
    if (side === "ceir") setCeirFiles((prev) => prev.filter((f) => f.id !== id));
    else setPayplusFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function resetSessionFiles() {
    setCeirFiles([]);
    setPayplusFiles([]);
    setError(null);
  }

  async function runReconciliation(): Promise<
    { ok: true } | { ok: false; error: string }
  > {
    if (!analysisPeriod || !effectivePeriodEnd) {
      return {
        ok: false,
        error: "Select a start and end period before running analysis.",
      };
    }
    if (!rangeTouchesInventory) {
      return {
        ok: false,
        error:
          "No stored data in this range. Upload files in Inventory first.",
      };
    }

    setIsRunning(true);
    setError(null);

    try {
      const apiResult = await runReconciliationApi(
        analysisPeriod,
        effectivePeriodEnd,
      );
      setResult(mapResult(apiResult));
      setHasResult(true);
      setComparedAt(apiResult.createdAt || new Date().toISOString());
      await refreshPeriods();
      return { ok: true };
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Analysis failed";
      setError(message);
      setHasResult(false);
      setResult(null);
      return { ok: false, error: message };
    } finally {
      setIsRunning(false);
    }
  }

  async function loadLatestForPeriod(periodValue: string | null) {
    if (!periodValue) {
      clearResult();
      return;
    }
    try {
      const latest = await fetchLatestReconciliation(periodValue);
      setResult(mapResult(latest));
      setHasResult(true);
      setComparedAt(latest.createdAt || null);
    } catch {
      clearResult();
    }
  }

  async function changeAnalysisPeriod(next: string | null) {
    setAnalysisPeriod(next);
    setAnalysisPeriodEnd(next);
    setError(null);
    await loadLatestForPeriod(next);
  }

  async function changeAnalysisPeriodRange(
    from: string | null,
    to: string | null,
  ) {
    if (!from || !to) {
      setAnalysisPeriod(null);
      setAnalysisPeriodEnd(null);
      clearResult();
      setError(null);
      return;
    }
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    setAnalysisPeriod(start);
    setAnalysisPeriodEnd(end);
    setError(null);
    // Prefer exact range label result when present; else end-period latest.
    try {
      const latest = await fetchLatestReconciliation(end);
      setResult(mapResult(latest));
      setHasResult(true);
      setComparedAt(latest.createdAt || null);
    } catch {
      clearResult();
    }
  }

  function clearResult() {
    setHasResult(false);
    setComparedAt(null);
    setResult(null);
  }

  const hasInventory = inventoryCounts.ceir + inventoryCounts.payplus > 0;

  const selectedAnalysisPeriodLabel =
    analysisPeriod && effectivePeriodEnd
      ? analysisPeriod === effectivePeriodEnd
        ? formatPeriodLabel(analysisPeriod)
        : `${formatPeriodLabel(analysisPeriod)} – ${formatPeriodLabel(effectivePeriodEnd)}`
      : null;

  return {
    ceirFiles,
    payplusFiles,
    analysisPeriod,
    analysisPeriodEnd: effectivePeriodEnd,
    periodOptions,
    analysisPeriodOptions,
    isReadingPeriods,
    isUploading,
    isRunning,
    hasResult,
    comparedAt,
    result: hasResult && hasInventory ? result : null,
    inventoryCounts,
    inventoryVersion,
    hasInventory,
    canAnalyze,
    status: hasInventory ? status : "empty",
    apiOnline,
    error,
    selectedAnalysisPeriodLabel,
    addFiles,
    removeFile,
    resetSessionFiles,
    runReconciliation,
    changeAnalysisPeriod,
    changeAnalysisPeriodRange,
    refreshPeriods,
    clearResult,
  };
}

export type ReconciliationState = ReturnType<typeof useReconciliation>;
