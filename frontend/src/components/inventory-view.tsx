"use client";

import { Suspense, useCallback, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  SourceCards,
  type InventorySource,
} from "@/components/inventory/source-cards";
import { InventoryUploadGrid } from "@/components/inventory-upload-grid";
import { useAppFeedback } from "@/components/providers/app-feedback";
import type { ReconciliationState } from "@/hooks/use-reconciliation";
import { ApiError, uploadReportFile } from "@/lib/api";
import {
  extractPeriodsFromFile,
  formatPeriodLabel,
  recentPeriodValues,
} from "@/lib/period-from-file";
import type { ReportSide } from "@/lib/types";
import {
  ACCEPTED_ACCEPT,
  validateUploadFile,
} from "@/lib/upload-validation";

type InventoryViewProps = {
  state: ReconciliationState;
};

function parseSourceParam(value: string | null): InventorySource | null {
  if (value === "ceir" || value === "payplus" || value === "all") return value;
  return null;
}

function sourceLabel(source: InventorySource) {
  if (source === "ceir") return "CEIR";
  if (source === "payplus") return "PayPlus";
  return "All";
}

function InventoryBody({ state }: InventoryViewProps) {
  const feedback = useAppFeedback();
  const { apiOnline, error, refreshPeriods } = state;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSource = parseSourceParam(searchParams.get("side"));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSideRef = useRef<ReportSide>("ceir");
  const [storedRefresh, setStoredRefresh] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const countsLoading = apiOnline !== false && state.inventoryVersion === 0;
  const ceirCount = apiOnline === false ? null : state.inventoryCounts.ceir;
  const payplusCount = apiOnline === false ? null : state.inventoryCounts.payplus;

  const setSource = useCallback(
    (source: InventorySource | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (source) {
        next.set("side", source);
        next.delete("page");
        next.delete("q");
      } else {
        next.delete("side");
        next.delete("page");
        next.delete("q");
        next.delete("sort");
        next.delete("dir");
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  function openUploadPicker(side: ReportSide) {
    uploadSideRef.current = side;
    fileInputRef.current?.click();
  }

  const handleUpload = useCallback(
    async (side: ReportSide, files: FileList | null) => {
      if (!files?.length) return;
      if (apiOnline === false) {
        feedback.error("API offline", "Start the backend before uploading.");
        return;
      }

      const fallbackPeriod = recentPeriodValues(1)[0];
      if (!fallbackPeriod) {
        feedback.error("Upload failed", "Could not determine upload period.");
        return;
      }

      setIsUploading(true);
      let successCount = 0;
      let failCount = 0;
      let lastPeriod: string | null = null;

      for (const file of Array.from(files)) {
        const check = validateUploadFile(file);
        if (!check.ok) {
          failCount += 1;
          feedback.error(file.name, check.error);
          continue;
        }
        try {
          const periods = await extractPeriodsFromFile(file);
          const period = periods[0] ?? fallbackPeriod;
          const saved = await uploadReportFile(side, period, file);
          lastPeriod = saved.periodKey || period;
          successCount += 1;
        } catch (err) {
          failCount += 1;
          feedback.error(
            file.name,
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Upload failed",
          );
        }
      }

      setIsUploading(false);

      if (successCount > 0) {
        feedback.success(
          "Upload complete",
          `${successCount} file${successCount === 1 ? "" : "s"} saved${
            lastPeriod ? ` under ${formatPeriodLabel(lastPeriod)}` : ""
          }.`,
        );
        setStoredRefresh((n) => n + 1);
        void refreshPeriods();
      } else if (failCount > 0) {
        feedback.error("Upload failed", "No files were stored.");
      }
    },
    [apiOnline, feedback, refreshPeriods],
  );

  return (
    <div className="space-y-4">
      {apiOnline === false ? (
        <section className="app-card border border-[var(--signal)]/30 bg-[var(--signal)]/5 px-4 py-3">
          <p className="text-[13px] font-medium text-[var(--signal)]">
            API is offline
          </p>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Frontend needs the Python API + PostgreSQL. Run start-project.ps1
            first.
          </p>
        </section>
      ) : null}

      {error ? (
        <section className="app-card border border-[var(--signal)]/30 bg-[var(--signal)]/5 px-4 py-3">
          <p className="text-[13px] font-medium text-[var(--signal)]">{error}</p>
        </section>
      ) : null}

      {!activeSource ? (
        <>
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--ink)]">
              Inventory
            </h2>
            <p className="mt-1 text-[13px] text-[var(--muted)]">
              Choose a source.
            </p>
          </div>
          <SourceCards
            ceirCount={ceirCount}
            payplusCount={payplusCount}
            loading={countsLoading}
            onSelect={(source) => setSource(source)}
          />
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <nav
                className="text-[12px] text-[var(--muted)]"
                aria-label="Breadcrumb"
              >
                <button
                  type="button"
                  className="font-medium text-[var(--navy)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--field-focus)]"
                  onClick={() => setSource(null)}
                >
                  Inventory
                </button>
                <span aria-hidden> / </span>
                <span className="text-[var(--ink)]">
                  {sourceLabel(activeSource)}
                </span>
              </nav>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="app-btn-outline app-btn-sm"
                  onClick={() => setSource(null)}
                >
                  ← Back
                </button>
                <h2 className="text-[16px] font-semibold text-[var(--ink)]">
                  {sourceLabel(activeSource)} uploads
                </h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept={ACCEPTED_ACCEPT}
                multiple
                disabled={isUploading || apiOnline === false}
                onChange={(e) => {
                  void handleUpload(uploadSideRef.current, e.target.files);
                  e.target.value = "";
                }}
              />
              {activeSource === "all" ? (
                <>
                  <button
                    type="button"
                    className="app-btn-outline app-btn-sm"
                    disabled={isUploading || apiOnline === false}
                    onClick={() => openUploadPicker("ceir")}
                  >
                    {isUploading ? "Uploading…" : "+ CEIR files"}
                  </button>
                  <button
                    type="button"
                    className="app-btn-primary app-btn-sm"
                    disabled={isUploading || apiOnline === false}
                    onClick={() => openUploadPicker("payplus")}
                  >
                    {isUploading ? "Uploading…" : "+ PayPlus files"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="app-btn-primary app-btn-sm"
                  disabled={isUploading || apiOnline === false}
                  onClick={() => openUploadPicker(activeSource)}
                >
                  {isUploading
                    ? "Uploading…"
                    : `+ ${sourceLabel(activeSource)} files`}
                </button>
              )}
            </div>
          </div>

          <InventoryUploadGrid
            apiOnline={apiOnline}
            inventoryVersion={state.inventoryVersion}
            lockedSide={activeSource === "all" ? null : activeSource}
            refreshToken={storedRefresh}
            onUploadClick={
              activeSource === "all"
                ? undefined
                : () => openUploadPicker(activeSource)
            }
            onChanged={() => {
              setStoredRefresh((n) => n + 1);
              void refreshPeriods();
            }}
          />
        </>
      )}
    </div>
  );
}

export function InventoryView({ state }: InventoryViewProps) {
  return (
    <Suspense
      fallback={
        <div className="app-card px-4 py-10 text-center text-[13px] text-[var(--muted)]">
          Loading inventory…
        </div>
      }
    >
      <InventoryBody state={state} />
    </Suspense>
  );
}
