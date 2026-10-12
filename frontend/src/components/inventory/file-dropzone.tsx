"use client";

import { useRef, useState, type DragEvent } from "react";

import {
  ACCEPTED_ACCEPT,
  ACCEPTED_EXTENSIONS,
  formatMaxUploadSize,
} from "@/lib/upload-validation";
import type { ReportSide } from "@/lib/types";

export type UploadQueueItem = {
  id: string;
  file: File;
  side: ReportSide;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  rowCount?: number;
  periodLabel?: string;
};

type FileDropzoneProps = {
  disabled?: boolean;
  onFiles: (side: ReportSide, files: File[]) => void;
  queue: UploadQueueItem[];
};

function SideDropZone({
  side,
  label,
  disabled,
  onFiles,
}: {
  side: ReportSide;
  label: string;
  disabled?: boolean;
  onFiles: (side: ReportSide, files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = `upload-${side}`;

  function takeFiles(list: FileList | null) {
    if (!list?.length || disabled) return;
    onFiles(side, Array.from(list));
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    if (!disabled) setDragging(true);
  }

  function onDragLeave(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    takeFiles(event.dataTransfer.files);
  }

  return (
    <label
      htmlFor={inputId}
      className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed border-[var(--field-border)] bg-[#f7f9fb] px-4 py-5 text-center transition ${
        dragging ? "border-[var(--navy)] bg-[#eef3f8]" : ""
      } ${
        disabled
          ? "cursor-not-allowed opacity-65"
          : "hover:border-[var(--navy)] hover:bg-[#eef3f8]"
      } focus-within:border-[var(--field-focus)] focus-within:shadow-[0_0_0_2px_var(--field-focus-ring)]`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        accept={ACCEPTED_ACCEPT}
        multiple
        disabled={disabled}
        onChange={(e) => takeFiles(e.target.files)}
      />
      <p className="text-[14px] font-semibold text-[var(--ink)]">{label}</p>
      <p className="mt-1 text-[13px] text-[var(--ink)]">
        Drop files here or click to browse
      </p>
      <p className="mt-1 text-[12px] text-[var(--muted)]">
        {ACCEPTED_EXTENSIONS.join(", ")} · Max {formatMaxUploadSize()}
      </p>
    </label>
  );
}

export function FileDropzone({ disabled, onFiles, queue }: FileDropzoneProps) {
  const ceirInputRef = useRef<HTMLInputElement>(null);
  const payplusInputRef = useRef<HTMLInputElement>(null);

  function openPicker(side: ReportSide) {
    if (disabled) return;
    if (side === "ceir") ceirInputRef.current?.click();
    else payplusInputRef.current?.click();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--ink)]">
            Upload files
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            Upload CEIR or PayPlus Excel / CSV. Period is taken from the file
            when possible.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="app-btn-primary app-btn-sm"
            disabled={disabled}
            onClick={() => openPicker("ceir")}
          >
            + CEIR files
          </button>
          <button
            type="button"
            className="app-btn-primary app-btn-sm"
            disabled={disabled}
            onClick={() => openPicker("payplus")}
          >
            + PayPlus files
          </button>
        </div>
      </div>

      {/* Hidden inputs driven by the header buttons; zones have their own inputs */}
      <input
        ref={ceirInputRef}
        type="file"
        className="sr-only"
        accept={ACCEPTED_ACCEPT}
        multiple
        disabled={disabled}
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) {
            onFiles("ceir", Array.from(e.target.files));
            e.target.value = "";
          }
        }}
      />
      <input
        ref={payplusInputRef}
        type="file"
        className="sr-only"
        accept={ACCEPTED_ACCEPT}
        multiple
        disabled={disabled}
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) {
            onFiles("payplus", Array.from(e.target.files));
            e.target.value = "";
          }
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SideDropZone
          side="ceir"
          label="CEIR"
          disabled={disabled}
          onFiles={onFiles}
        />
        <SideDropZone
          side="payplus"
          label="PayPlus"
          disabled={disabled}
          onFiles={onFiles}
        />
      </div>

      {queue.length > 0 ? (
        <ul
          className="space-y-2"
          aria-live="polite"
          aria-label="Upload progress"
        >
          {queue.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 rounded-lg border border-[var(--line-soft)] bg-[#f8fafc] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-[family-name:var(--font-mono)] text-[12px] text-[var(--ink)]">
                  {item.file.name}
                </p>
                <p className="text-[11px] text-[var(--muted)]">
                  {item.side === "ceir" ? "CEIR" : "PayPlus"}
                  {item.periodLabel ? ` · ${item.periodLabel}` : ""}
                  {item.rowCount != null
                    ? ` · ${item.rowCount.toLocaleString()} rows`
                    : ""}
                </p>
              </div>
              <p
                className={`shrink-0 text-[12px] font-medium ${
                  item.status === "error"
                    ? "text-[var(--signal)]"
                    : item.status === "success"
                      ? "text-[var(--ok)]"
                      : "text-[var(--muted)]"
                }`}
              >
                {item.status === "pending"
                  ? "Waiting…"
                  : item.status === "uploading"
                    ? "Uploading…"
                    : item.status === "success"
                      ? "Saved"
                      : item.error || "Failed"}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
