"use client";

import { useMemo, useState } from "react";

import {
  TableCheckbox,
  useRowSelection,
} from "@/components/ui/table-select";
import { formatMmk } from "@/lib/format";
import { categoryLabels } from "@/lib/mock-reconciliation";
import type { MismatchCategory, ReconciliationResult } from "@/lib/types";

type ResultsPanelProps = {
  result: ReconciliationResult;
};

type CategoryFilter = "all" | MismatchCategory;

const CATEGORY_FILTERS: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unconfirmed", label: "Unconfirmed" },
  { id: "fraud", label: "Fraud" },
  { id: "duplicate", label: "Duplicate" },
  { id: "overpay", label: "Overpay" },
  { id: "month_boundary", label: "Month" },
];

function MismatchTable({
  rows,
}: {
  rows: ReconciliationResult["mismatches"];
}) {
  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const selection = useRowSelection(ids);

  if (rows.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-[13px] text-[var(--muted)]">
        No rows
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {selection.selectedCount > 0 ? (
        <p className="text-[12px] text-[var(--muted)]" data-pdf-hide>
          {selection.selectedCount} selected
        </p>
      ) : null}
      <div className="app-table-wrap rounded-[6px] border border-[var(--line)]">
        <table className="app-table min-w-[900px]">
          <thead>
            <tr>
              <th style={{ width: 40 }} data-pdf-hide>
                <TableCheckbox
                  checked={selection.allSelected}
                  indeterminate={selection.someSelected}
                  onChange={(next) => selection.toggleAll(next)}
                  label="Select all mismatch rows"
                />
              </th>
              <th>Application ID</th>
              <th>Category</th>
              <th>Amount</th>
              <th>IRD / PayPlus</th>
              <th>CEIR</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const checked = selection.isSelected(row.id);
              return (
                <tr
                  key={row.id}
                  className={checked ? "is-selected" : undefined}
                  onClick={() => selection.toggleOne(row.id, !checked)}
                >
                  <td data-pdf-hide>
                    <TableCheckbox
                      checked={checked}
                      onChange={(next) => selection.toggleOne(row.id, next)}
                      label={`Select ${row.applicationId}`}
                    />
                  </td>
                  <td>
                    <span className="font-[family-name:var(--font-mono)] text-[12px]">
                      {row.applicationId}
                    </span>
                  </td>
                  <td>{categoryLabels[row.category]}</td>
                  <td>
                    <span className="font-[family-name:var(--font-mono)] text-[12px]">
                      {formatMmk(row.amountMmk)}
                    </span>
                  </td>
                  <td>{row.irdStatus}</td>
                  <td>{row.ceirStatus}</td>
                  <td>
                    <span className="max-w-sm text-[var(--muted)]">
                      {row.detail}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TotalsPanel({ result }: ResultsPanelProps) {
  const ids = useMemo(
    () => result.summary.map((row) => row.label),
    [result.summary],
  );
  const selection = useRowSelection(ids);

  return (
    <div className="space-y-2">
      {selection.selectedCount > 0 ? (
        <p className="text-[12px] text-[var(--muted)]" data-pdf-hide>
          {selection.selectedCount} selected
        </p>
      ) : null}
      <div className="app-table-wrap overflow-hidden rounded-[10px] border border-[var(--line)] bg-white">
        <table className="app-table min-w-[680px] bg-white [&_th]:bg-white">
          <thead>
            <tr>
              <th style={{ width: 40 }} data-pdf-hide>
                <TableCheckbox
                  checked={selection.allSelected}
                  indeterminate={selection.someSelected}
                  onChange={(next) => selection.toggleAll(next)}
                  label="Select all summary rows"
                />
              </th>
              <th>Metric</th>
              <th>IRD / PayPlus</th>
              <th>CEIR</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {result.summary.map((row) => {
              const checked = selection.isSelected(row.label);
              return (
                <tr
                  key={row.label}
                  className={checked ? "is-selected" : undefined}
                  onClick={() => selection.toggleOne(row.label, !checked)}
                >
                  <td data-pdf-hide>
                    <TableCheckbox
                      checked={checked}
                      onChange={(next) =>
                        selection.toggleOne(row.label, next)
                      }
                      label={`Select ${row.label}`}
                    />
                  </td>
                  <td>{row.label}</td>
                  <td>
                    <span className="font-[family-name:var(--font-mono)] text-[12px]">
                      {row.ird}
                    </span>
                  </td>
                  <td>
                    <span className="font-[family-name:var(--font-mono)] text-[12px]">
                      {row.ceir}
                    </span>
                  </td>
                  <td>
                    <span className="text-[var(--muted)]">
                      {row.note ?? "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DifferencesPanel({ result }: ResultsPanelProps) {
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const all = result.mismatches;

  function count(id: CategoryFilter) {
    if (id === "all") return all.length;
    return all.filter((row) => row.category === id).length;
  }

  const visibleFilters = CATEGORY_FILTERS.filter(
    (item) => item.id === "all" || count(item.id) > 0,
  );
  const activeFilter =
    visibleFilters.some((item) => item.id === filter) ? filter : "all";
  const rows =
    activeFilter === "all"
      ? all
      : all.filter((row) => row.category === activeFilter);

  return (
    <div className="app-card overflow-hidden">
      <div className="border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {visibleFilters.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`category-tab ${activeFilter === item.id ? "is-active" : ""}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label} ({count(item.id)})
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">
        <MismatchTable rows={rows} />
      </div>
    </div>
  );
}
