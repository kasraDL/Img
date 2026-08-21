import * as XLSX from "xlsx";
import type { ApplicationRecord } from "../types";

const COLUMNS = [
  "Position",
  "University",
  "Country",
  "Field",
  "Professor Name",
  "Professor Email",
  "Funding",
  "Status",
  "Applied On",
  "Follow-ups Sent",
  "Last Reminder",
  "Listing URL",
] as const;

/**
 * Several columns (funding info, professor name, position title...) come from
 * AI extraction off scraped web pages we don't control. If any of that text
 * happens to start with =, +, -, or @, Excel/Sheets/LibreOffice will treat the
 * cell as a formula when the student opens the report - a well-known CSV/XLSX
 * "formula injection" risk. Prefixing with a single quote forces it to render
 * as plain text instead, exactly like Excel's own paste-as-text behavior.
 */
function sanitizeCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function statusLabel(status: ApplicationRecord["application_status"]): string {
  const labels: Record<ApplicationRecord["application_status"], string> = {
    draft: "Draft (not sent)",
    ready: "Ready to send",
    sent: "Sent",
    replied: "Replied",
    rejected: "Rejected",
    accepted: "Accepted",
    withdrawn: "Withdrawn",
  };
  return labels[status] ?? status;
}

/**
 * Builds a ready-to-download .xlsx workbook, one row per application, with
 * every field the student asked to track. Returns raw bytes to attach as a
 * Telegram document.
 */
export function buildApplicationsWorkbook(applications: ApplicationRecord[]): Uint8Array {
  const rows = applications.map((a) => ({
    [COLUMNS[0]]: sanitizeCell(a.position_title ?? ""),
    [COLUMNS[1]]: sanitizeCell(a.university ?? ""),
    [COLUMNS[2]]: sanitizeCell(a.country ?? ""),
    [COLUMNS[3]]: sanitizeCell(a.field ?? ""),
    [COLUMNS[4]]: sanitizeCell(a.professor_name ?? ""),
    [COLUMNS[5]]: sanitizeCell(a.professor_email ?? ""),
    [COLUMNS[6]]: sanitizeCell(a.funding_info ?? ""),
    [COLUMNS[7]]: statusLabel(a.application_status),
    [COLUMNS[8]]: a.sent_at ?? "",
    [COLUMNS[9]]: a.reminder_count,
    [COLUMNS[10]]: a.last_reminder_notified_at ?? "",
    [COLUMNS[11]]: sanitizeCell(a.position_url ?? ""),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...COLUMNS] });
  // Reasonable column widths so it's readable without manual resizing.
  worksheet["!cols"] = [
    { wch: 32 }, // Position
    { wch: 24 }, // University
    { wch: 14 }, // Country
    { wch: 20 }, // Field
    { wch: 20 }, // Professor Name
    { wch: 28 }, // Professor Email
    { wch: 20 }, // Funding
    { wch: 16 }, // Status
    { wch: 18 }, // Applied On
    { wch: 12 }, // Follow-ups Sent
    { wch: 18 }, // Last Reminder
    { wch: 40 }, // Listing URL
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Applications");

  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buffer as ArrayBuffer);
}
