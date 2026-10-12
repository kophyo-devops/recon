import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";

import { categoryLabels } from "@/lib/mock-reconciliation";
import type { ReconciliationResult } from "@/lib/types";

export type ExportFormat = "excel" | "pdf";

function safeFilePart(value: string) {
  return value
    .replace(/[–—]/g, "-")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function buildExportFilename(
  result: ReconciliationResult,
  comparedAt?: string | null,
  extension: "xlsx" | "pdf" = "xlsx",
) {
  const stamp = comparedAt
    ? new Date(comparedAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return `CEIR_Reconciliation_${safeFilePart(result.periodLabel)}_${stamp}.${extension}`;
}

export function exportReconciliationReport(
  result: ReconciliationResult,
  options?: { comparedAt?: string | null },
) {
  const workbook = XLSX.utils.book_new();

  const overviewRows = [
    ["CEIR Reconciliation Report"],
    ["Period", result.periodLabel],
    [
      "Exported at",
      new Date().toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    ],
    [
      "Last analysis",
      options?.comparedAt
        ? new Date(options.comparedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "—",
    ],
    [],
    ["HUB / PayPlus paid", result.irdPaid],
    ["CEIR paid", result.ceirPaid],
    ["Matched", result.matchedCount],
    ["Exceptions", result.mismatchCount],
    ["Adjusted HUB sum (MMK)", result.adjustedIrdSum],
    ["Adjusted CEIR sum (MMK)", result.adjustedCeirSum],
    ["Sums equal", result.sumsEqual ? "Yes" : "No"],
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(overviewRows),
    "Overview",
  );

  const totalsRows = [
    ["Metric", "IRD / PayPlus", "CEIR", "Note"],
    ...result.summary.map((row) => [
      row.label,
      row.ird,
      row.ceir,
      row.note ?? "",
    ]),
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(totalsRows),
    "Totals",
  );

  const differencesRows = [
    [
      "Application ID",
      "Category",
      "Amount (MMK)",
      "IRD / PayPlus",
      "CEIR",
      "Detail",
    ],
    ...result.mismatches.map((row) => [
      row.applicationId,
      categoryLabels[row.category] ?? row.category,
      row.amountMmk ?? "",
      row.irdStatus,
      row.ceirStatus,
      row.detail,
    ]),
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(differencesRows),
    "Differences",
  );

  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, buildExportFilename(result, options?.comparedAt, "xlsx"));
}

/** Capture Analysis content off-screen so the live page is never mutated. */
export async function exportReconciliationPdf(
  element: HTMLElement,
  result: ReconciliationResult,
  options?: { comparedAt?: string | null },
) {
  const width = Math.max(element.scrollWidth, element.clientWidth, 960);
  const host = document.createElement("div");
  host.setAttribute("data-pdf-capture-root", "");
  host.style.cssText = [
    "position:fixed",
    "left:-12000px",
    "top:0",
    `width:${width}px`,
    "margin:0",
    "padding:24px",
    "background:#ffffff",
    "color:#12151a",
    "z-index:-1",
    "pointer-events:none",
    "overflow:visible",
  ].join(";");

  const title = document.createElement("div");
  title.style.cssText =
    "margin:0 0 16px;padding:0 0 12px;border-bottom:1px solid #e6edf3";
  const heading = document.createElement("h1");
  heading.textContent = "CEIR Reconciliation Report";
  heading.style.cssText =
    "margin:0;font-size:18px;font-weight:600;color:#12151a";
  const sub = document.createElement("p");
  sub.textContent = [
    result.periodLabel,
    options?.comparedAt
      ? `Last update ${new Date(options.comparedAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  sub.style.cssText = "margin:6px 0 0;font-size:12px;color:#3f4a57";
  title.append(heading, sub);

  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.add("is-pdf-export");
  clone.style.background = "#ffffff";

  host.append(title, clone);
  document.body.appendChild(host);

  try {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      width,
      windowWidth: width,
    });

    const imgData = canvas.toDataURL("image/png", 1);
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const imgHeight = (canvas.height * usableWidth) / canvas.width;

    let heightLeft = imgHeight;
    let offsetY = 0;

    while (heightLeft > 0) {
      if (offsetY > 0) pdf.addPage();
      pdf.addImage(
        imgData,
        "PNG",
        margin,
        margin - offsetY,
        usableWidth,
        imgHeight,
      );
      offsetY += usableHeight;
      heightLeft -= usableHeight;
    }

    pdf.save(buildExportFilename(result, options?.comparedAt, "pdf"));
  } finally {
    host.remove();
  }
}
