"use client";

import { Download, FileText, Inbox, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { useAppFeedback } from "@/components/providers/app-feedback";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SourceBadge } from "@/components/ui/source-badge";
import {
  TableCheckbox,
  useRowSelection,
} from "@/components/ui/table-select";
import {
  deleteUploadBatch,
  downloadUploadBatch,
  fetchUploadBatches,
  type UploadBatchGridItem,
} from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type { ReportSide } from "@/lib/types";

type InventoryUploadGridProps = {
  apiOnline: boolean | null;
  /** When null / omitted, load CEIR + PayPlus together. */
  lockedSide?: ReportSide | null;
  refreshToken?: number;
  onChanged?: () => void;
  onUploadClick?: () => void;
};

const PAGE_SIZE = 10;
type SortKey = "uploadedAt" | "period";
type SortDir = "asc" | "desc";
type ListStatus = "loading" | "error" | "empty" | "data";

function parseSort(value: string | null): SortKey {
  return value === "period" ? "period" : "uploadedAt";
}

function parseDir(value: string | null): SortDir {
  return value === "asc" ? "asc" : "desc";
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-left font-semibold text-[var(--muted)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--field-focus)]"
      onClick={onClick}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <span aria-hidden className="text-[10px]">
        {active ? (dir === "asc" ? "▲" : "▼") : "◇"}
      </span>
    </button>
  );
}

function SkeletonRows() {
  return (
    <div
      className="space-y-2 px-4 py-4"
      aria-busy="true"
      aria-label="Loading uploads"
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-10 animate-pulse rounded-[6px] bg-[#e8eef4]"
        />
      ))}
    </div>
  );
}

export function InventoryUploadGrid({
  apiOnline,
  lockedSide = null,
  refreshToken = 0,
  onChanged,
  onUploadClick,
}: InventoryUploadGridProps) {
  const feedback = useAppFeedback();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const sort = parseSort(searchParams.get("sort"));
  const sortDir = parseDir(searchParams.get("dir"));
  const qFromUrl = searchParams.get("q") ?? "";

  const [queryInput, setQueryInput] = useState(qFromUrl);
  const debouncedQuery = useDebouncedValue(queryInput, 300);

  const [items, setItems] = useState<UploadBatchGridItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQueryInput(qFromUrl);
  }, [qFromUrl]);

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      if (lockedSide) next.set("side", lockedSide);
      else next.set("side", "all");
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [lockedSide, pathname, router, searchParams],
  );

  useEffect(() => {
    if (debouncedQuery === qFromUrl) return;
    replaceParams({
      q: debouncedQuery.trim() || null,
      page: "1",
    });
  }, [debouncedQuery, qFromUrl, replaceParams]);

  const load = useCallback(async () => {
    if (apiOnline === false) {
      setItems([]);
      setTotal(0);
      setError("API is offline. Start the backend and try again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchUploadBatches({
        page,
        pageSize: PAGE_SIZE,
        q: qFromUrl,
        ...(lockedSide ? { side: lockedSide } : {}),
        sort,
        sortDir,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(
        err instanceof Error ? err.message : "Could not load uploaded files",
      );
    } finally {
      setLoading(false);
    }
  }, [apiOnline, lockedSide, page, qFromUrl, sort, sortDir]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const searchActive = Boolean(qFromUrl.trim());
  const sideLabel =
    lockedSide === "ceir"
      ? "CEIR"
      : lockedSide === "payplus"
        ? "PayPlus"
        : "All";

  const status: ListStatus = loading
    ? "loading"
    : error
      ? "error"
      : items.length === 0
        ? "empty"
        : "data";

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const itemIds = items.map((row) => row.batchId);
  const selection = useRowSelection(itemIds);

  function toggleSort(next: SortKey) {
    if (sort === next) {
      replaceParams({ dir: sortDir === "asc" ? "desc" : "asc", page: "1" });
    } else {
      replaceParams({
        sort: next,
        dir: next === "uploadedAt" ? "desc" : "asc",
        page: "1",
      });
    }
  }

  async function handleDelete(row: UploadBatchGridItem) {
    const ok = await feedback.confirm({
      title: "Delete upload?",
      message: `Remove “${row.fileName}” and all ${row.rowCount.toLocaleString()} stored rows?`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    try {
      await deleteUploadBatch(row.batchId);
      feedback.success("Upload deleted", row.fileName);
      selection.clear();
      onChanged?.();
      await load();
    } catch (err) {
      feedback.error(
        "Delete failed",
        err instanceof Error ? err.message : "Request failed",
      );
    }
  }

  async function handleDeleteSelected() {
    const rows = items.filter((row) => selection.isSelected(row.batchId));
    if (rows.length === 0) return;
    const ok = await feedback.confirm({
      title: "Delete selected uploads?",
      message: `Remove ${rows.length} selected file${rows.length === 1 ? "" : "s"} and their stored rows?`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    try {
      for (const row of rows) {
        await deleteUploadBatch(row.batchId);
      }
      feedback.success(
        "Uploads deleted",
        `${rows.length} file${rows.length === 1 ? "" : "s"} removed.`,
      );
      selection.clear();
      onChanged?.();
      await load();
    } catch (err) {
      feedback.error(
        "Delete failed",
        err instanceof Error ? err.message : "Request failed",
      );
    }
  }

  async function handleDownload(row: UploadBatchGridItem) {
    try {
      await downloadUploadBatch(row.batchId, row.fileName);
      feedback.success("Download started", row.fileName);
    } catch (err) {
      feedback.error(
        "Download failed",
        err instanceof Error ? err.message : "Request failed",
      );
    }
  }

  function ActionButtons({ row }: { row: UploadBatchGridItem }) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--navy)] hover:bg-[#e8eef4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--field-focus)]"
          onClick={() => void handleDownload(row)}
          aria-label={`Download ${row.fileName}`}
          title="Download"
        >
          <Download size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--signal)] hover:bg-[var(--signal)]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--field-focus)]"
          onClick={() => void handleDelete(row)}
          aria-label={`Delete ${row.fileName}`}
          title="Delete"
        >
          <Trash2 size={16} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  let body: ReactNode;
  if (status === "loading") {
    body = <SkeletonRows />;
  } else if (status === "error") {
    body = (
      <ErrorState
        title="Could not load uploads"
        message={error || "Request failed"}
        onRetry={() => void load()}
      />
    );
  } else if (status === "empty") {
    body = searchActive ? (
      <EmptyState
        icon={<FileText size={28} strokeWidth={1.5} />}
        title="No matching uploads"
        description={
          lockedSide
            ? `No ${sideLabel} files match this search.`
            : "No uploads match this search."
        }
        action={
          <button
            type="button"
            className="app-btn-outline app-btn-sm"
            onClick={() => {
              setQueryInput("");
              replaceParams({ q: null, page: "1" });
            }}
          >
            Clear search
          </button>
        }
      />
    ) : (
      <EmptyState
        icon={<Inbox size={28} strokeWidth={1.5} />}
        title={lockedSide ? `No ${sideLabel} files yet` : "No uploads yet"}
        description={
          lockedSide
            ? `Upload ${sideLabel} Excel / CSV files to get started.`
            : "Upload CEIR or PayPlus Excel / CSV files to get started."
        }
        action={
          onUploadClick && lockedSide ? (
            <button
              type="button"
              className="app-btn-primary app-btn-sm"
              onClick={onUploadClick}
            >
              + {sideLabel} files
            </button>
          ) : null
        }
      />
    );
  } else {
    body = (
      <>
        <div className="app-table-wrap hidden md:block">
          <table className="app-table min-w-[920px]">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <TableCheckbox
                    checked={selection.allSelected}
                    indeterminate={selection.someSelected}
                    onChange={(next) => selection.toggleAll(next)}
                    label="Select all uploads on this page"
                  />
                </th>
                <th>File name</th>
                <th>Source</th>
                <th>
                  <SortHeader
                    label="Period"
                    active={sort === "period"}
                    dir={sortDir}
                    onClick={() => toggleSort("period")}
                  />
                </th>
                <th>Rows</th>
                <th>
                  <SortHeader
                    label="Uploaded at"
                    active={sort === "uploadedAt"}
                    dir={sortDir}
                    onClick={() => toggleSort("uploadedAt")}
                  />
                </th>
                <th>Uploaded by</th>
                <th style={{ width: 96 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const checked = selection.isSelected(row.batchId);
                return (
                  <tr
                    key={row.batchId}
                    className={checked ? "is-selected" : undefined}
                    onClick={() => selection.toggleOne(row.batchId, !checked)}
                  >
                    <td>
                      <TableCheckbox
                        checked={checked}
                        onChange={(next) =>
                          selection.toggleOne(row.batchId, next)
                        }
                        label={`Select ${row.fileName}`}
                      />
                    </td>
                    <td>
                      <p className="max-w-[280px] truncate font-[family-name:var(--font-mono)] text-[12px]">
                        {row.fileName}
                      </p>
                      <p className="text-[11px] text-[var(--muted)]">
                        {formatBytes(row.fileSize)}
                      </p>
                    </td>
                    <td>
                      <SourceBadge side={row.side} />
                    </td>
                    <td className="text-[12px] text-[var(--muted)]">
                      {row.periodLabel}
                    </td>
                    <td className="font-[family-name:var(--font-mono)] text-[12px]">
                      {row.rowCount.toLocaleString()}
                    </td>
                    <td className="text-[12px] text-[var(--muted)]">
                      {row.uploadedAt
                        ? new Date(row.uploadedAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>
                    <td className="text-[12px]">{row.uploadedBy || "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <ActionButtons row={row} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-[var(--line-soft)] md:hidden">
          {items.map((row) => {
            const checked = selection.isSelected(row.batchId);
            return (
              <li
                key={row.batchId}
                className={`space-y-2 px-4 py-3 ${checked ? "bg-[#eef4fb]" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <TableCheckbox
                    checked={checked}
                    onChange={(next) =>
                      selection.toggleOne(row.batchId, next)
                    }
                    label={`Select ${row.fileName}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-[family-name:var(--font-mono)] text-[12px] font-medium">
                          {row.fileName}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--muted)]">
                          {row.periodLabel} · {row.rowCount.toLocaleString()}{" "}
                          rows · {formatBytes(row.fileSize)}
                        </p>
                      </div>
                      <SourceBadge side={row.side} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-[var(--muted)]">
                      <span>
                        {row.uploadedAt
                          ? new Date(row.uploadedAt).toLocaleString(
                              undefined,
                              {
                                dateStyle: "medium",
                                timeStyle: "short",
                              },
                            )
                          : "—"}
                        {row.uploadedBy ? ` · ${row.uploadedBy}` : ""}
                      </span>
                      <ActionButtons row={row} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <section className="app-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--line-soft)] px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--ink)]">
            Uploaded files
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            {lockedSide
              ? `${sideLabel} uploads only`
              : "CEIR and PayPlus uploads"}
            {selection.selectedCount > 0
              ? ` · ${selection.selectedCount} selected`
              : ""}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          {selection.selectedCount > 0 ? (
            <button
              type="button"
              className="app-btn-outline app-btn-sm text-[var(--signal)]"
              onClick={() => void handleDeleteSelected()}
            >
              Delete selected ({selection.selectedCount})
            </button>
          ) : null}
          <div className="w-full sm:w-[220px]">
            <label
              htmlFor="upload-grid-search"
              className="mb-1 block text-[12px] font-medium text-[var(--ink)]"
            >
              Search file
            </label>
            <input
              id="upload-grid-search"
              className="app-field"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="File name"
              aria-label="Search uploaded files by name"
            />
          </div>
        </div>
      </div>

      {body}

      {status === "data" || status === "empty" ? (
        <div className="flex flex-col gap-2 border-t border-[var(--line-soft)] px-4 py-3 text-[12px] text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>
            {total === 0
              ? "0 uploads"
              : `Showing ${from}–${to} of ${total.toLocaleString()} upload${
                  total === 1 ? "" : "s"
                }`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="app-btn-outline app-btn-sm"
              disabled={page <= 1 || status === "empty"}
              onClick={() => replaceParams({ page: String(page - 1) })}
              aria-label="Previous page"
            >
              Previous
            </button>
            <span>
              Page {page} / {pageCount}
            </span>
            <button
              type="button"
              className="app-btn-outline app-btn-sm"
              disabled={page >= pageCount || total === 0}
              onClick={() => replaceParams({ page: String(page + 1) })}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
