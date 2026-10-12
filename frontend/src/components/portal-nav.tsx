"use client";

import { useLayoutEffect, useRef, useState } from "react";

export type PortalSection = "dashboard" | "inventory" | "analysis";

type PortalNavProps = {
  active: PortalSection;
  onChange: (section: PortalSection) => void;
};

const ITEMS: { id: PortalSection; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "inventory", label: "Inventory" },
  { id: "analysis", label: "Analysis" },
];

export function PortalNav({ active, onChange }: PortalNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const measure = () => {
      const button = nav.querySelector<HTMLButtonElement>(`[data-section="${active}"]`);
      if (!button) return;
      setPill({ left: button.offsetLeft, width: button.offsetWidth, ready: true });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [active]);

  return (
    <nav ref={navRef} className="relative flex gap-1" aria-label="Main navigation">
      <span
        aria-hidden
        className={`portal-nav-pill pointer-events-none absolute top-0 bottom-0 rounded-md bg-[var(--navy)] ${
          pill.ready ? "portal-nav-pill-ready" : "opacity-0"
        }`}
        style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
      />
      {ITEMS.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            data-section={item.id}
            aria-current={isActive ? "page" : undefined}
            className={`relative z-10 rounded-md border-0 px-3 py-2 text-[13px] transition-colors duration-200 ${
              isActive
                ? "font-semibold text-white"
                : "bg-transparent font-medium text-[var(--muted)] hover:bg-[#e8edf3] hover:text-[var(--ink)]"
            }`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
