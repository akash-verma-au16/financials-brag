import { expireSession, getAccessToken } from "./google-auth";

/** Thin typed client for the Google Sheets REST API v4 (read-only). */

const API = "https://sheets.googleapis.com/v4/spreadsheets";

export type CellValue = string | number | boolean;
export type NumberFormatType =
  | "TEXT" | "NUMBER" | "PERCENT" | "CURRENCY" | "DATE" | "TIME" | "DATE_TIME" | "SCIENTIFIC";

export interface TabMeta {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface SpreadsheetMeta {
  id: string;
  title: string;
  tabs: TabMeta[];
}

export class SheetsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Accepts a full Google Sheets URL or a bare spreadsheet ID. */
export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/);
  if (fromUrl?.[1]) return fromUrl[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(trimmed) ? trimmed : null;
}

const quoteTab = (title: string) => `'${title.replace(/'/g, "''")}'`;

// Waits before each retry of a rate-limited (429) request. Sheets allows 60 reads/min per user.
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const get = <T,>(url: string) => googleRequest<T>(url);

/** Authenticated JSON request to a Google API, with 429 backoff and readable errors. */
export async function googleRequest<T>(url: string, init: { method?: string; body?: unknown } = {}, attempt = 0): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new SheetsError("Not signed in to Google.", 401);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined && { "Content-Type": "application/json" }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    referrerPolicy: "no-referrer",
  });
  if (res.ok) return (await res.json()) as T;
  if (res.status === 429 && attempt < RETRY_DELAYS_MS.length) {
    await sleep(RETRY_DELAYS_MS[attempt]!);
    return googleRequest<T>(url, init, attempt + 1);
  }
  if (res.status === 401) {
    expireSession();
    throw new SheetsError("Google session expired. Sign in again.", 401);
  }
  if (res.status === 403) {
    // 403 covers both "API not enabled in the Cloud project" and "no access to this file".
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string; details?: { reason?: string }[] };
    } | null;
    const reason = body?.error?.details?.find((d) => d.reason)?.reason;
    if (reason === "SERVICE_DISABLED" || reason === "API_DISABLED") {
      throw new SheetsError(
        `The Google Sheets API isn't enabled in your Google Cloud project. Enable it under APIs & Services → Library, wait a minute, then retry.`,
        403,
      );
    }
    throw new SheetsError(
      `This Google account can't open that spreadsheet. Sign in with the account that owns it, or share it with this one.${
        body?.error?.message ? ` (Google: ${body.error.message})` : ""
      }`,
      403,
    );
  }
  if (res.status === 404) throw new SheetsError("Spreadsheet not found. Check the link.", 404);
  if (res.status === 429) throw new SheetsError("Google rate limit hit. Wait a minute and retry.", 429);
  throw new SheetsError(`Google Sheets error (${res.status}).`, res.status);
}

export async function getSpreadsheetMeta(id: string): Promise<SpreadsheetMeta> {
  const fields = "properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))";
  const data = await get<{
    properties: { title: string };
    sheets: { properties: { sheetId: number; title: string; gridProperties: { rowCount: number; columnCount: number } } }[];
  }>(`${API}/${id}?fields=${encodeURIComponent(fields)}`);
  return {
    id,
    title: data.properties.title,
    tabs: data.sheets.map(({ properties: p }) => ({
      sheetId: p.sheetId,
      title: p.title,
      rowCount: p.gridProperties.rowCount,
      columnCount: p.gridProperties.columnCount,
    })),
  };
}

const rangesParam = (ranges: string[]) => ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");

/**
 * All values of every listed tab in ONE request, unformatted
 * (numbers stay numbers, dates come back as serial numbers).
 */
export async function getAllTabValues(id: string, tabs: string[]): Promise<Record<string, CellValue[][]>> {
  const params = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
    majorDimension: "ROWS",
  });
  const data = await get<{ valueRanges?: { values?: CellValue[][] }[] }>(
    `${API}/${id}/values:batchGet?${rangesParam(tabs.map(quoteTab))}&${params}`,
  );
  // valueRanges come back in the same order as the requested ranges.
  return Object.fromEntries(tabs.map((t, i) => [t, data.valueRanges?.[i]?.values ?? []]));
}

export type FormatGrid = (NumberFormatType | undefined)[][];

/**
 * Number-format type of each cell in the top `rows` rows of every listed tab, in ONE request.
 * This is how we tell a date or currency column apart from a plain number.
 */
export async function getAllTabFormats(id: string, tabs: string[], rows = 60): Promise<Record<string, FormatGrid>> {
  const fields = "sheets(properties.title,data.rowData.values.effectiveFormat.numberFormat.type)";
  const data = await get<{
    sheets?: {
      properties?: { title?: string };
      data?: { rowData?: { values?: { effectiveFormat?: { numberFormat?: { type?: NumberFormatType } } }[] }[] }[];
    }[];
  }>(`${API}/${id}?${rangesParam(tabs.map((t) => `${quoteTab(t)}!A1:ZZ${rows}`))}&fields=${encodeURIComponent(fields)}`);

  const out: Record<string, FormatGrid> = {};
  for (const sheet of data.sheets ?? []) {
    const title = sheet.properties?.title;
    if (title === undefined) continue;
    out[title] = (sheet.data?.[0]?.rowData ?? []).map((r) =>
      (r.values ?? []).map((c) => c.effectiveFormat?.numberFormat?.type),
    );
  }
  return out;
}

/** Majority-vote format per column across `sample` rows starting at 0-based row `from`. */
export function columnFormats(grid: FormatGrid, from: number, sample = 25): (NumberFormatType | undefined)[] {
  const votes: Map<NumberFormatType, number>[] = [];
  for (const row of grid.slice(from, from + sample)) {
    row.forEach((type, col) => {
      if (!type) return;
      const m = (votes[col] ??= new Map());
      m.set(type, (m.get(type) ?? 0) + 1);
    });
  }
  return Array.from(votes, (m) => (m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined));
}
