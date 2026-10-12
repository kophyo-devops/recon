"use client";

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
  return (
    <nav className="flex gap-1" aria-label="Main navigation">
      {ITEMS.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            className={`rounded-[6px] border-0 px-3 py-2 text-[13px] transition ${
              isActive
                ? "bg-[var(--navy)] font-semibold text-white"
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
