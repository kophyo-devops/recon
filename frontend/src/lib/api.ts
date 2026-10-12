import type { AuthUser } from "@/lib/auth";
import { notifySessionExpired } from "@/lib/auth-session";
import type { ReconciliationResult, ReportSide } from "@/lib/types";

/**
 * Same-origin by default (Next.js rewrites → FastAPI) so httpOnly cookies
 * are set on the app host. Override only if you fully control CORS + Secure.
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

/** Auth/bootstrap paths: no auto-refresh + no session-expiry redirect. */
const AUTH_SKIP_REFRESH = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/refresh",
  "/api/auth/me",
  "/health",
]);

export function isAbortError(err: unknown) {
  return err instanceof Error && err.name === "AbortError";
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseDetail(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            return String((item as { msg: unknown }).msg);
          }
          return JSON.stringify(item);
        })
        .join("; ");
    }
  } catch {
    // ignore
  }
  return response.statusText || "Request failed";
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        return response.ok;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

function pathWithoutQuery(path: string) {
  const q = path.indexOf("?");
  return q === -1 ? path : path.slice(0, q);
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  retried = false,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });

  if (response.status === 401) {
    const bare = pathWithoutQuery(path);
    if (!retried && !AUTH_SKIP_REFRESH.has(bare)) {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        return apiFetch<T>(path, init, true);
      }
      notifySessionExpired();
    } else if (!AUTH_SKIP_REFRESH.has(bare)) {
      notifySessionExpired();
    }
    throw new ApiError(await parseDetail(response), 401);
  }

  if (!response.ok) {
    throw new ApiError(await parseDetail(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type ApiPeriod = {
  id: string;
  value: string;
  label: string;
  year: number;
  month: number;
};

export type ApiReconciliationResult = ReconciliationResult & {
  id: string;
  createdAt: string;
};

export type UploadResult = {
  batchId: string;
  side: ReportSide;
  fileName: string;
  fileSize: number;
  rowCount: number;
  periodLabel: string;
  periodKey: string;
};

export function getApiBaseUrl() {
  return API_URL || "(same-origin)";
}

export async function fetchHealth() {
  return apiFetch<{ status: string; database: string }>("/health");
}

export async function loginRequest(username: string, password: string) {
  return apiFetch<AuthUser>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export async function logoutRequest() {
  return apiFetch<void>("/api/auth/logout", { method: "POST" });
}

export async function fetchCurrentUser() {
  return apiFetch<AuthUser>("/api/auth/me");
}

export async function refreshSession() {
  return apiFetch<AuthUser>("/api/auth/refresh", { method: "POST" });
}

export async function fetchPeriods() {
  return apiFetch<ApiPeriod[]>("/api/periods");
}

export async function runReconciliationApi(
  period: string,
  periodEnd?: string | null,
) {
  return apiFetch<ApiReconciliationResult>("/api/reconciliation/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      period,
      ...(periodEnd && periodEnd !== period ? { periodEnd } : {}),
    }),
  });
}

export async function fetchLatestReconciliation(period?: string) {
  const query = period ? `?period=${encodeURIComponent(period)}` : "";
  return apiFetch<ApiReconciliationResult>(`/api/reconciliation/latest${query}`);
}

export type DashboardCategoryTotal = {
  count: number;
  amount: number;
};

export type DashboardMonth = {
  period: string;
  ceirFiles: number;
  payplusFiles: number;
  ceirRows: number;
  payplusRows: number;
  matchedCount: number | null;
  mismatchCount: number | null;
  irdPaid: number | null;
  ceirPaid: number | null;
  adjustedIrdSum: number | null;
  adjustedCeirSum: number | null;
  sumsEqual: boolean | null;
  categories: Partial<Record<string, DashboardCategoryTotal>>;
};

export async function fetchDashboardSeries(
  from: string,
  to: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ from, to });
  return apiFetch<DashboardMonth[]>(
    `/api/dashboard/series?${query.toString()}`,
    { signal },
  );
}

export async function uploadReportFile(
  side: ReportSide,
  period: string,
  file: File,
) {
  const body = new FormData();
  body.append("side", side);
  body.append("period", period);
  body.append("file", file);

  return apiFetch<UploadResult>("/api/uploads", {
    method: "POST",
    body,
  });
}

export type UploadBatchSummary = {
  batchId: string;
  side: ReportSide;
  fileName: string;
  fileSize: number;
  rowCount: number;
  uploadedAt: string;
  uploadedBy?: string | null;
};

export type UploadBatchGridItem = {
  batchId: string;
  periodKey: string;
  periodLabel: string;
  side: ReportSide;
  fileName: string;
  fileSize: number;
  rowCount: number;
  uploadedAt: string;
  uploadedBy: string | null;
};

export type UploadBatchesPage = {
  periodKey: string | null;
  periodLabel: string | null;
  total: number;
  page: number;
  pageSize: number;
  items: UploadBatchGridItem[];
};

export type UploadPeriodSummary = {
  periodKey: string;
  periodLabel: string;
  year: number;
  month: number;
  sides: {
    ceir: {
      batchCount: number;
      rowCount: number;
      batches: UploadBatchSummary[];
    };
    payplus: {
      batchCount: number;
      rowCount: number;
      batches: UploadBatchSummary[];
    };
  };
};

export type DeleteUploadsResult = {
  periodKey: string;
  periodLabel: string;
  deletedBatches: number;
  deletedCeirRows: number;
  deletedHubRows: number;
  clearedRuns: number;
  sides: string[];
};

export type UploadRow = {
  id: string;
  batchId: string | null;
  side: ReportSide;
  applicationId: string | null;
  requestId: string | null;
  txnId: string | null;
  status: string | null;
  taxAmountMmk: number | null;
  sourceType: string | null;
  paymentDt: string | null;
  confirmedAt: string | null;
};

export type UploadRowsPage = {
  periodKey: string;
  periodLabel: string;
  side: ReportSide;
  total: number;
  page: number;
  pageSize: number;
  items: UploadRow[];
};

export async function fetchUploadSummary(period: string) {
  return apiFetch<UploadPeriodSummary>(
    `/api/uploads/summary?period=${encodeURIComponent(period)}`,
  );
}

export async function fetchUploadBatches(
  params: {
  period?: string;
  uploadedFrom?: string;
  uploadedTo?: string;
  page?: number;
  pageSize?: number;
  side?: ReportSide;
  q?: string;
  sort?: "uploadedAt" | "period";
  sortDir?: "asc" | "desc";
},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 10),
    sort: params.sort ?? "uploadedAt",
    sortDir: params.sortDir ?? "desc",
  });
  if (params.period) query.set("period", params.period);
  if (params.uploadedFrom) query.set("uploadedFrom", params.uploadedFrom);
  if (params.uploadedTo) query.set("uploadedTo", params.uploadedTo);
  if (params.side) query.set("side", params.side);
  if (params.q?.trim()) query.set("q", params.q.trim());
  return apiFetch<UploadBatchesPage>(
    `/api/uploads/batches?${query.toString()}`,
    { signal },
  );
}

export async function fetchUploadRows(params: {
  period: string;
  side: ReportSide;
  page?: number;
  pageSize?: number;
  q?: string;
}) {
  const query = new URLSearchParams({
    period: params.period,
    side: params.side,
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 50),
  });
  if (params.q?.trim()) query.set("q", params.q.trim());
  return apiFetch<UploadRowsPage>(`/api/uploads/rows?${query.toString()}`);
}

export async function deleteUploads(params: {
  period: string;
  side?: ReportSide;
  clearRuns?: boolean;
}) {
  const query = new URLSearchParams({ period: params.period });
  if (params.side) query.set("side", params.side);
  if (params.clearRuns === false) query.set("clearRuns", "false");
  return apiFetch<DeleteUploadsResult>(`/api/uploads?${query.toString()}`, {
    method: "DELETE",
  });
}

export async function deleteUploadBatch(
  batchId: string,
  clearRuns: boolean = true,
) {
  const query = clearRuns ? "" : "?clearRuns=false";
  return apiFetch<DeleteUploadsResult>(
    `/api/uploads/batches/${encodeURIComponent(batchId)}${query}`,
    { method: "DELETE" },
  );
}

/** Download original uploaded file (or rebuilt export for legacy batches). */
export async function downloadUploadBatch(
  batchId: string,
  fileName: string,
  retried = false,
) {
  const path = `/api/uploads/batches/${encodeURIComponent(batchId)}/download`;
  const response = await fetch(`${API_URL}${path}`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "*/*" },
  });

  if (response.status === 401) {
    if (!retried) {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        return downloadUploadBatch(batchId, fileName, true);
      }
    }
    notifySessionExpired();
    throw new ApiError("Session expired", 401);
  }

  if (!response.ok) {
    throw new ApiError(await parseDetail(response), response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(
    /filename\*?=(?:UTF-8''|")?([^\";]+)"?/i,
  );
  const resolvedName = match
    ? decodeURIComponent(match[1].trim())
    : fileName || "download.xlsx";

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = resolvedName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
