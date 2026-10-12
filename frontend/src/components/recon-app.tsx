"use client";

import { useMemo, useState } from "react";

import { AnalysisView } from "@/components/analysis-view";
import { DashboardView } from "@/components/dashboard-view";
import { InventoryView } from "@/components/inventory-view";
import { PortalNav, type PortalSection } from "@/components/portal-nav";
import { useReconciliation } from "@/hooks/use-reconciliation";

type ReconAppProps = {
  username: string;
  onLogout: () => void;
};

export function ReconApp({ username, onLogout }: ReconAppProps) {
  const state = useReconciliation();
  const [section, setSection] = useState<PortalSection>("dashboard");

  const availablePeriods = useMemo(
    () => state.analysisPeriodOptions.map((option) => option.value),
    [state.analysisPeriodOptions],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--canvas)]">
      <header className="shrink-0 border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-[22px] leading-none tracking-tight text-[var(--ink)] sm:text-[24px]">
              <span className="font-bold">CEIR</span>{" "}
              <span className="font-normal">Reconciliation Portal</span>
            </h1>
            <div className="flex items-center gap-3">
              <span className="hidden text-[13px] text-[var(--muted)] sm:inline">
                {username}
              </span>
              <span className="hidden text-[11px] text-[var(--muted)] lg:inline">
                v0.1.0
              </span>
              <button
                type="button"
                className="app-btn-outline app-btn-sm"
                onClick={onLogout}
              >
                Logout
              </button>
            </div>
          </div>
          <PortalNav active={section} onChange={setSection} />
        </div>
      </header>

      <main className="app-scroll mx-auto w-full max-w-[1280px] min-h-0 flex-1 px-4 py-3 sm:px-5 sm:py-4">
        {section === "dashboard" ? (
          <DashboardView
            status={state.status}
            fileCounts={state.inventoryCounts}
            availablePeriods={availablePeriods}
            inventoryVersion={state.inventoryVersion}
            analysisResult={state.result}
            onGoInventory={() => setSection("inventory")}
            onGoAnalysis={() => setSection("analysis")}
          />
        ) : null}

        {section === "inventory" ? <InventoryView state={state} /> : null}

        {section === "analysis" ? (
          <AnalysisView
            state={state}
            onGoInventory={() => setSection("inventory")}
          />
        ) : null}
      </main>
    </div>
  );
}
