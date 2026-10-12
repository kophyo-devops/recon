export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;
export const ACCEPTED_ACCEPT =
  ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";

export function formatMaxUploadSize() {
  return "25 MB";
}

export function validateUploadFile(
  file: File,
): { ok: true } | { ok: false; error: string } {
  const name = file.name.toLowerCase();
  const allowed = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!allowed) {
    return {
      ok: false,
      error: `Unsupported type. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, error: "File is empty." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `File exceeds ${formatMaxUploadSize()} limit.`,
    };
  }
  return { ok: true };
}
