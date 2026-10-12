"use client";

import { useEffect, useMemo, useState } from "react";

export function TableCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      className="app-table-check"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate && !checked;
      }}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function useRowSelection<T extends string>(ids: T[]) {
  const [selected, setSelected] = useState<Set<T>>(() => new Set());
  const visibleKey = ids.join("|");
  const visibleSet = useMemo(() => new Set(ids), [visibleKey]);

  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = new Set<T>();
      for (const id of prev) {
        if (visibleSet.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleSet]);

  const allSelected =
    ids.length > 0 && ids.every((id) => selected.has(id));
  const someSelected =
    ids.some((id) => selected.has(id)) && !allSelected;

  function toggleOne(id: T, next: boolean) {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function toggleAll(next: boolean) {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) {
        for (const id of ids) copy.add(id);
      } else {
        for (const id of ids) copy.delete(id);
      }
      return copy;
    });
  }

  function clear() {
    setSelected(new Set());
  }

  return {
    selected,
    selectedIds: [...selected],
    selectedCount: selected.size,
    allSelected,
    someSelected,
    isSelected: (id: T) => selected.has(id),
    toggleOne,
    toggleAll,
    clear,
  };
}
