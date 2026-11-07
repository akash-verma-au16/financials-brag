import type { CellValue, NumberFormatType } from "./sheets";

/** Profiles a sheet tab's columns: types, fill rate, cardinality, shape. Runs entirely in the browser. */

export type ColumnKind =
  | "empty" | "date" | "datetime" | "currency" | "percent" | "integer" | "number"
  | "boolean" | "currency-code" | "iso-date-text" | "text" | "mixed";

export interface ColumnProfile {
  index: number;
  letter: string;
  header: string;
  kind: ColumnKind;
  numberFormat?: NumberFormatType;
  filled: number;
  distinct: number;
  /** Share of each raw JS type among filled cells, e.g. { number: 0.98, string: 0.02 }. */
  mix: Record<string, number>;
  /** Masked shapes of text values (letters → A/a, digits → 9). Not the values themselves. */
  patterns: { pattern: string; share: number }[];
  /** Value hints — only exported when the user opts in. */
  categories?: string[];
  range?: { min: string; max: string };
}

export interface TabProfile {
  title: string;
  headerRow: number; // 1-based
  dataRows: number;
  columns: ColumnProfile[];
}

export function columnLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const isFilled = (v: CellValue | undefined): v is CellValue => v !== undefined && v !== null && v !== "";

/** Header = first row (within the first 10) with ≥2 filled cells that are all text. */
export function detectHeaderRow(rows: CellValue[][]): number {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const filled = (rows[r] ?? []).filter(isFilled);
    if (filled.length >= 2 && filled.every((v) => typeof v === "string")) return r;
  }
  return 0;
}

/** Google Sheets serial date → ISO date string (UTC). */
export function serialToIso(serial: number, withTime = false): string {
  const iso = new Date(Math.round((serial - 25569) * 86400000)).toISOString();
  return withTime ? iso.slice(0, 16).replace("T", " ") : iso.slice(0, 10);
}

function mask(s: string): string {
  const m = s.replace(/[A-Z]/g, "A").replace(/[a-z]/g, "a").replace(/[0-9]/g, "9");
  return m.length > 28 ? `${m.slice(0, 28)}…(${m.length})` : m;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/;

function classify(values: CellValue[], fmt: NumberFormatType | undefined): ColumnKind {
  if (values.length === 0) return "empty";
  const nums = values.filter((v) => typeof v === "number") as number[];
  const strs = values.filter((v) => typeof v === "string") as string[];
  const bools = values.filter((v) => typeof v === "boolean");
  const dominant = Math.max(nums.length, strs.length, bools.length) / values.length;
  if (dominant < 0.9) return "mixed";

  if (nums.length >= strs.length && nums.length >= bools.length) {
    if (fmt === "DATE") return "date";
    if (fmt === "DATE_TIME") return "datetime";
    if (fmt === "CURRENCY") return "currency";
    if (fmt === "PERCENT") return "percent";
    return nums.every(Number.isInteger) ? "integer" : "number";
  }
  if (bools.length > strs.length) return "boolean";
  if (strs.every((s) => CURRENCY_CODE.test(s))) return "currency-code";
  if (strs.every((s) => ISO_DATE.test(s))) return "iso-date-text";
  return "text";
}

function display(v: CellValue, kind: ColumnKind): string {
  if (typeof v === "number" && (kind === "date" || kind === "datetime")) return serialToIso(v, kind === "datetime");
  return String(v);
}

// Columns whose values must never be exported as "category values": account/card numbers, IDs etc.
const IDENTIFIER_HEADER = /number|\bno\b|#|\bid\b|iban|card|transit|routing|sin\b/i;
const LONG_DIGITS = /\d{4,}/;

function looksLikeIdentifier(header: string, distinct: string[]): boolean {
  if (IDENTIFIER_HEADER.test(header)) return true;
  return distinct.filter((v) => LONG_DIGITS.test(v)).length > distinct.length * 0.2;
}

export function profileTab(title: string, rows: CellValue[][], formats: (NumberFormatType | undefined)[]): TabProfile {
  const headerIdx = detectHeaderRow(rows);
  const header = rows[headerIdx] ?? [];
  const body = rows.slice(headerIdx + 1).filter((r) => r.some(isFilled));
  const width = Math.max(header.length, ...body.map((r) => r.length), 0);

  const columns: ColumnProfile[] = [];
  for (let c = 0; c < width; c++) {
    const values = body.map((r) => r[c]).filter(isFilled);
    const fmt = formats[c];
    const kind = classify(values, fmt);

    const mix: Record<string, number> = {};
    for (const v of values) mix[typeof v] = (mix[typeof v] ?? 0) + 1;
    for (const k in mix) mix[k] = mix[k]! / values.length;

    const distinctSet = new Set(values.map((v) => String(v)));

    const patternCounts = new Map<string, number>();
    for (const v of values) if (typeof v === "string") patternCounts.set(mask(v), (patternCounts.get(mask(v)) ?? 0) + 1);
    const patterns = [...patternCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([pattern, n]) => ({ pattern, share: n / values.length }));

    const col: ColumnProfile = {
      index: c,
      letter: columnLetter(c),
      header: String(header[c] ?? "").trim() || `(untitled ${columnLetter(c)})`,
      kind,
      numberFormat: fmt,
      filled: values.length,
      distinct: distinctSet.size,
      mix,
      patterns,
    };

    if (
      (kind === "text" || kind === "currency-code" || kind === "boolean") &&
      distinctSet.size <= 20 &&
      !looksLikeIdentifier(col.header, [...distinctSet])
    ) {
      col.categories = [...distinctSet].sort();
    }
    if (kind === "date" || kind === "datetime" || kind === "iso-date-text") {
      const sorted = values.map((v) => display(v, kind)).sort();
      col.range = { min: sorted[0]!, max: sorted[sorted.length - 1]! };
    }
    columns.push(col);
  }

  return { title, headerRow: headerIdx + 1, dataRows: body.length, columns };
}

export function sampleRows(rows: CellValue[][], profile: TabProfile, n = 10): string[][] {
  return rows
    .slice(profile.headerRow)
    .filter((r) => r.some(isFilled))
    .slice(0, n)
    .map((r) => profile.columns.map((c) => (isFilled(r[c.index]) ? display(r[c.index]!, c.kind) : "")));
}

/** Markdown description of the structure. Contains no cell values unless includeHints is true. */
export function structureMarkdown(tabs: TabProfile[], includeHints: boolean): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const out: string[] = [
    "# Sheet structure",
    `Generated ${new Date().toISOString().slice(0, 10)} by the Financials Data Inspector. ` +
      (includeHints ? "Includes category values and date ranges." : "No cell values included."),
    "",
  ];
  for (const t of tabs) {
    out.push(`## Tab "${t.title}" — ${t.dataRows} data rows, header on row ${t.headerRow}`, "");
    out.push("| Col | Header | Type | Sheet format | Filled | Distinct | Text shapes |" + (includeHints ? " Hints |" : ""));
    out.push("|---|---|---|---|---|---|---|" + (includeHints ? "---|" : ""));
    for (const c of t.columns) {
      const shapes = c.patterns.map((p) => `\`${p.pattern}\` ${pct(p.share)}`).join(", ");
      const mixNote = c.kind === "mixed" ? ` (${Object.entries(c.mix).map(([k, v]) => `${k} ${pct(v)}`).join(", ")})` : "";
      let row = `| ${c.letter} | ${c.header.replace(/\|/g, "\\|")} | ${c.kind}${mixNote} | ${c.numberFormat ?? "—"} | ${
        t.dataRows ? pct(c.filled / t.dataRows) : "—"
      } | ${c.distinct} | ${shapes || "—"} |`;
      if (includeHints) {
        const hints = [
          c.categories ? `values: ${c.categories.map((v) => v.replace(/\|/g, "\\|")).join(" · ")}` : "",
          c.range ? `range: ${c.range.min} → ${c.range.max}` : "",
        ].filter(Boolean).join("; ");
        row += ` ${hints || "—"} |`;
      }
      out.push(row);
    }
    out.push("");
  }
  return out.join("\n");
}
