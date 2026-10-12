"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { AnalysisView } from "@/components/analysis-view";
import { DashboardView } from "@/components/dashboard-view";
import { InventoryView } from "@/components/inventory-view";
import { PortalNav, type PortalSection } from "@/components/portal-nav";
import { useReconciliation } from "@/hooks/use-reconciliation";

type ReconAppProps = {
  username: string;
  onLogout: () => void;
};

type PortalDirection = "forward" | "back";

const SECTION_ORDER: PortalSection[] = ["dashboard", "inventory", "analysis"];

function directionBetween(from: PortalSection, to: PortalSection): PortalDirection {
  return SECTION_ORDER.indexOf(to) >= SECTION_ORDER.indexOf(from) ? "forward" : "back";
}

export function ReconApp({ username, onLogout }: ReconAppProps) {
  const state = useReconciliation();
  const [section, setSection] = useState<PortalSection>("dashboard");
  const [enterDir, setEnterDir] = useState<PortalDirection | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sectionRef = useRef(section);
  sectionRef.current = section;

  const availablePeriods = useMemo(
    () => state.analysisPeriodOptions.map((option) => option.value),
    [state.analysisPeriodOptions],
  );

  const changeSection = useCallback((next: PortalSection) => {
    const current = sectionRef.current;
    if (next === current) return;

    const dir = directionBetween(current, next);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const apply = () => {
      setSection(next);
      mainRef.current?.scrollTo({ top: 0 });
    };

    const start = document.startViewTransition?.bind(document);
    if (reduce || !start) {
      setEnterDir(reduce ? null : dir);
      apply();
      return;
    }

    document.documentElement.dataset.portalDir = dir;
    setEnterDir(null);
    try {
      start(() => {
        flushSync(apply);
      });
    } catch {
      apply();
    }
  }, []);

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
          <PortalNav active={section} onChange={changeSection} />
        </div>
      </header>

      <main
        ref={mainRef}
        className="app-scroll mx-auto w-full max-w-[1280px] min-h-0 flex-1 px-4 py-3 sm:px-5 sm:py-4"
      >
        <div
          className={enterDir ? "portal-stage portal-stage-enter" : "portal-stage"}
          data-dir={enterDir ?? undefined}
        >
          {section === "dashboard" ? (
            <DashboardView
              status={state.status}
              fileCounts={state.inventoryCounts}
              availablePeriods={availablePeriods}
              inventoryVersion={state.inventoryVersion}
              analysisResult={state.result}
              onGoInventory={() => changeSection("inventory")}
              onGoAnalysis={() => changeSection("analysis")}
            />
          ) : null}

          {section === "inventory" ? <InventoryView state={state} /> : null}

          {section === "analysis" ? (
            <AnalysisView
              state={state}
              onGoInventory={() => changeSection("inventory")}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
