"use client";

type SegmentOption<T extends string> = {
  id: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  id?: string;
};

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  id = "segmented",
}: SegmentedControlProps<T>) {
  return (
    <div>
      <p
        id={`${id}-label`}
        className="mb-1 text-[12px] font-medium text-[var(--ink)]"
      >
        {label}
      </p>
      <div
        className="inline-flex h-[34px] overflow-hidden rounded-md border-[1.5px] border-[var(--field-border)] bg-white"
        role="group"
        aria-labelledby={`${id}-label`}
      >
        {options.map((option, index) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`inline-flex h-full items-center px-3 text-[12px] font-medium transition ${
                index < options.length - 1
                  ? "border-r border-[var(--line-soft)]"
                  : ""
              } ${
                selected
                  ? "bg-[var(--navy)] text-white"
                  : "bg-transparent text-[var(--muted)] hover:bg-[#f3f6f9] hover:text-[var(--ink)]"
              } focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--field-focus)]`}
              aria-pressed={selected}
              onClick={() => onChange(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
