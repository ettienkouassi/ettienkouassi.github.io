/** Lecture / écriture de fichiers tabulaires (CSV, Excel). */
import ExcelJS from "exceljs";

export type Table = { headers: string[]; rows: string[][] };

export function parseCsv(text: string): Table {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : (firstLine.includes("\t") ? "\t" : ",");
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    out.push(row);
  }
  const nonEmpty = out.filter((r) => r.some((c) => c.trim() !== ""));
  const [headers = [], ...rows] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows: rows.map((r) => r.map((c) => c.trim())) };
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("hyperlink" in v) return String((v as { text?: string }).text ?? "");
    return "";
  }
  return String(v).trim();
}

export async function parseXlsx(buffer: Buffer): Promise<Table> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const all: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals: string[] = [];
    for (let c = 1; c <= Math.min(ws.columnCount, 60); c++) vals.push(cellText(r.getCell(c).value));
    all.push(vals);
  });
  const [headers = [], ...rows] = all.filter((r) => r.some((c) => c !== ""));
  return { headers, rows: rows.slice(0, 5000) };
}

/** Neutralise l'injection de formules dans les tableurs (CSV injection). */
export function safeCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => {
    const s = safeCell(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Séparateur « ; » et BOM UTF-8 : ouverture directe dans Excel en français
  return "﻿" + [headers, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}

export async function toXlsx(sheetName: string, headers: string[], rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TRAINING OS AI";
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r.map((v) => (typeof v === "number" ? v : safeCell(v))));
  ws.columns.forEach((col) => {
    col.width = Math.min(40, Math.max(12, ...(col.values ?? []).map((v) => String(v ?? "").length + 2)));
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
