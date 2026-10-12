"use client";

type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center px-4 py-12 text-center"
      role="alert"
      aria-live="assertive"
    >
      <p className="text-[14px] font-semibold text-[var(--signal)]">{title}</p>
      <p className="mt-1 max-w-md text-[13px] text-[var(--muted)]">{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="app-btn-primary app-btn-sm mt-4"
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
