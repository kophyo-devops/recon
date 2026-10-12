"use client";

import { Spinner } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";

import { useAppFeedback } from "@/components/providers/app-feedback";
import {
  TableCheckbox,
  useRowSelection,
} from "@/components/ui/table-select";
import {
  ApiError,
  deleteUploadBatch,
  deleteUploads,
  fetchUploadRows,
  fetchUploadSummary,
  type UploadPeriodSummary,
  type UploadRow,
} from "@/lib/api";
import { formatBytes, formatMmk } from "@/lib/format";
import { formatPeriodLabel } from "@/lib/period-from-file";
import type { ReportSide } from "@/lib/types";

type StoredDataPanelProps = {
  period: string | null;
  apiOnline: boolean | null;
  refreshToken?: number;
  onChanged?: () => void;
};

export function StoredDataPanel({
  period,
  apiOnline,
  refreshToken = 0,
  onChanged,
}: StoredDataPanelProps) {
  const feedback = useAppFeedback();
  const [summary, setSummary] = useState<UploadPeriodSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browseSide, setBrowseSide] = useState<ReportSide>("ceir");
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [rowsLoading, setRowsLoading] = useState(false);
  const rowIds = rows.map((row) => String(row.id));
  const selection = useRowSelection(rowIds);

  const loadSummary = useCallback(async () => {
    if (!period || apiOnline === false) {
      setSummary(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchUploadSummary(period);
      setSummary(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setSummary(null);
        setError(null);
      } else {
        setSummary(null);
        setError(
          err instanceof Error ? err.message : "Could not load stored uploads",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [period, apiOnline]);

  const loadRows = useCallback(async () => {
    if (!period || apiOnline === false) {
      setRows([]);
      setTotal(0);
      return;
    }
    setRowsLoading(true);
    try {
      const pageData = await fetchUploadRows({
        period,
        side: browseSide,
        page,
        pageSize: 25,
        q: query,
      });
      setRows(pageData.items);
      setTotal(pageData.total);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setRows([]);
        setTotal(0);
      } else {
        setError(
          err instanceof Error ? err.message : "Could not load uploaded rows",
        );
      }
    } finally {
      setRowsLoading(false);
    }
  }, [period, apiOnline, browseSide, page, query]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary, refreshToken]);

  useEffect(() => {
    void loadRows();
  }, [loadRows, refreshToken]);

  useEffect(() => {
    setPage(1);
  }, [period, browseSide, query]);

  async function handleDeleteSide(side: ReportSide) {
    if (!period) return;
    const label = side === "ceir" ? "CEIR" : "PayPlus";
    const ok = await feedback.confirm({
      title: `Delete ${label} data?`,
      message: `Remove all uploaded ${label} batches for ${formatPeriodLabel(period)} from the database. Reconciliation results for this period will also be cleared.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    try {
      const result = await deleteUploads({ period, side });
      feedback.success(
        `${label} data deleted`,
        `${result.deletedBatches} batch(es), ${
          side === "ceir" ? result.deletedCeirRows : result.deletedHubRows
        } rows removed.`,
      );
      await loadSummary();
      await loadRows();
      onChanged?.();
    } catch (err) {
      feedback.error(
        "Delete failed",
        err instanceof Error ? err.message : "Request failed",
      );
    }
  }

  async function handleDeleteAll() {
    if (!period) return;
    const ok = await feedback.confirm({
      title: "Delete all stored data?",
      message: `Remove every CEIR and PayPlus upload for ${formatPeriodLabel(period)} from the database, including reconciliation runs.`,
      confirmLabel: "Delete all",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    try {
      const result = await deleteUploads({ period });
      feedback.success(
        "Period data deleted",
        `${result.deletedBatches} batch(es) removed for ${result.periodLabel}.`,
      );
      await loadSummary();
      await loadRows();
      onChanged?.();
    } catch (err) {
      feedback.error(
        "Delete failed",
        err instanceof Error ? err.message : "Request failed",
      );
    }
  }

  async function handleDeleteBatch(batchId: string, fileName: string) {
    const ok = await feedback.confirm({
      title: "Delete upload batch?",
      message: `Remove “${fileName}” and its rows from the database.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    try {
      await deleteUploadBatch(batchId);
      feedback.success("Batch deleted", fileName);
      await loadSummary();
      await loadRows();
      onChanged?.();
    } catch (err) {
      feedback.error(
        "Delete failed",
        err instanceof Error ? err.message : "Request failed",
      );
    }
  }

  if (!period) {
    return (
      <section className="app-card px-4 py-6 text-center">
        <p className="text-[14px] font-medium text-[var(--ink)]">
          Select a period to review stored data
        </p>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          Uploaded CEIR / PayPlus rows are kept in PostgreSQL by month.
        </p>
      </section>
    );
  }

  const ceir = summary?.sides.ceir;
  const payplus = summary?.sides.payplus;
  const hasAny =
    (ceir?.batchCount ?? 0) + (payplus?.batchCount ?? 0) > 0;
  const pageCount = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="space-y-3">
      <section className="app-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">
              Stored data · {formatPeriodLabel(period)}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Browse and delete uploads already saved in the database for this
              month. Compare uses this data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="app-btn-outline app-btn-sm"
              disabled={!hasAny || loading}
              onClick={() => void handleDeleteSide("ceir")}
            >
              Delete CEIR
            </button>
            <button
              type="button"
              className="app-btn-outline app-btn-sm"
              disabled={!hasAny || loading}
              onClick={() => void handleDeleteSide("payplus")}
            >
              Delete PayPlus
            </button>
            <button
              type="button"
              className="app-btn-outline app-btn-sm text-[var(--signal)]"
              disabled={!hasAny || loading}
              onClick={() => void handleDeleteAll()}
            >
              Delete all
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-[13px] text-[var(--muted)]">
            <Spinner size="sm" /> Loading stored batches…
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-[13px] text-[var(--signal)]">{error}</p>
        ) : null}

        {!loading && !hasAny ? (
          <p className="mt-4 text-[13px] text-[var(--muted)]">
            No uploaded batches in the database for this period yet.
          </p>
        ) : null}

        {hasAny ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(
              [
                { side: "ceir" as const, label: "CEIR", data: ceir },
                { side: "payplus" as const, label: "PayPlus", data: payplus },
              ] as const
            ).map((block) => (
              <div
                key={block.side}
                className="rounded-xl border border-[var(--line-soft)] px-3 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[var(--ink)]">
                    {block.label}
                  </p>
                  <p className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--muted)]">
                    {block.data?.batchCount ?? 0} file
                    {(block.data?.batchCount ?? 0) === 1 ? "" : "s"} ·{" "}
                    {(block.data?.rowCount ?? 0).toLocaleString()} rows
                  </p>
                </div>
                <ul className="mt-2 space-y-2">
                  {(block.data?.batches ?? []).map((batch) => (
                    <li
                      key={batch.batchId}
                      className="flex items-start justify-between gap-2 text-[12px]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-[family-name:var(--font-mono)] text-[var(--ink)]">
                          {batch.fileName}
                        </p>
                        <p className="text-[var(--muted)]">
                          {batch.rowCount.toLocaleString()} rows ·{" "}
                          {formatBytes(batch.fileSize)}
                          {batch.uploadedAt
                            ? ` · ${new Date(batch.uploadedAt).toLocaleString(
                                undefined,
                                { dateStyle: "short", timeStyle: "short" },
                              )}`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 font-medium text-[var(--signal)] hover:underline"
                        onClick={() =>
                          void handleDeleteBatch(batch.batchId, batch.fileName)
                        }
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                  {(block.data?.batches.length ?? 0) === 0 ? (
                    <li className="text-[var(--muted)]">No batches</li>
                  ) : null}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="app-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--line-soft)] px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">
              Review rows by period
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Re-check uploaded Application IDs / RequestIDs for{" "}
              {formatPeriodLabel(period)}.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <p className="mb-1 text-[12px] font-medium text-[var(--ink)]">
                Side
              </p>
              <div className="flex gap-1.5">
                {(
                  [
                    { id: "ceir" as const, label: "CEIR" },
                    { id: "payplus" as const, label: "PayPlus" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`category-tab ${
                      browseSide === item.id ? "is-active" : ""
                    }`}
                    onClick={() => setBrowseSide(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-full sm:w-[220px]">
              <label
                htmlFor="stored-row-search"
                className="mb-1 block text-[12px] font-medium text-[var(--ink)]"
              >
                Search
              </label>
              <input
                id="stored-row-search"
                className="app-field"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Application / Request ID"
              />
            </div>
          </div>
        </div>

        {rowsLoading ? (
          <div className="flex items-center gap-2 px-4 py-8 text-[13px] text-[var(--muted)]">
            <Spinner size="sm" /> Loading rows…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[var(--muted)]">
            No rows for this side / search.
          </div>
        ) : (
          <div className="app-table-wrap">
            <table className="app-table min-w-[900px]">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <TableCheckbox
                      checked={selection.allSelected}
                      indeterminate={selection.someSelected}
                      onChange={(next) => selection.toggleAll(next)}
                      label="Select all stored rows on this page"
                    />
                  </th>
                  <th>Application / Request</th>
                  <th>Txn / source</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const id = String(row.id);
                  const checked = selection.isSelected(id);
                  return (
                    <tr
                      key={row.id}
                      className={checked ? "is-selected" : undefined}
                      onClick={() => selection.toggleOne(id, !checked)}
                    >
                      <td>
                        <TableCheckbox
                          checked={checked}
                          onChange={(next) => selection.toggleOne(id, next)}
                          label={`Select ${row.applicationId || row.id}`}
                        />
                      </td>
                      <td>
                        <p className="font-[family-name:var(--font-mono)] text-[12px]">
                          {row.applicationId || "—"}
                        </p>
                        {row.requestId &&
                        row.requestId !== row.applicationId ? (
                          <p className="text-[11px] text-[var(--muted)]">
                            {row.requestId}
                          </p>
                        ) : null}
                      </td>
                      <td className="font-[family-name:var(--font-mono)] text-[12px]">
                        {row.txnId || row.sourceType || "—"}
                      </td>
                      <td className="text-[12px]">{row.status || "—"}</td>
                      <td className="font-[family-name:var(--font-mono)] text-[12px]">
                        {formatMmk(row.taxAmountMmk)}
                      </td>
                      <td className="text-[12px] text-[var(--muted)]">
                        {row.paymentDt || row.confirmedAt
                          ? new Date(
                              row.paymentDt || row.confirmedAt || "",
                            ).toLocaleString(undefined, {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[var(--line-soft)] px-4 py-3 text-[12px] text-[var(--muted)]">
          <span>
            {total.toLocaleString()} row{total === 1 ? "" : "s"}
            {selection.selectedCount > 0
              ? ` · ${selection.selectedCount} selected`
              : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="app-btn-outline app-btn-sm"
              disabled={page <= 1 || rowsLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span>
              Page {page} / {pageCount}
            </span>
            <button
              type="button"
              className="app-btn-outline app-btn-sm"
              disabled={page >= pageCount || rowsLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
