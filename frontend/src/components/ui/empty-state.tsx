"use client";

import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      {icon ? (
        <div className="mb-3 text-[var(--muted)]" aria-hidden>
          {icon}
        </div>
      ) : null}
      <p className="text-[14px] font-semibold text-[var(--ink)]">{title}</p>
      <p className="mt-1 max-w-md text-[13px] text-[var(--muted)]">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
