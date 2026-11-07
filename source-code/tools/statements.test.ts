import { describe, expect, it } from "vitest";
import { csvRows, parseAmount, parseCsv, parseDate, parsePdfLines } from "./statements.ts";
import type { StatementAccountMeta } from "../src/data/statement-types.ts";

// Synthetic statement content only.
const card: StatementAccountMeta = { institution: "Bank A", type: "credit" };
const chq: StatementAccountMeta = { institution: "Bank A", type: "chequing" };

describe("dates and amounts", () => {
  it("parses common bank formats", () => {
    expect(parseDate("2026-09-12")).toBe("2026-09-12");
    expect(parseDate("9/12/2026")).toBe("2026-09-12");
    expect(parseDate("12/9/2026", "DMY")).toBe("2026-09-12");
    expect(parseDate("25/09/2026")).toBe("2026-09-25"); // day > 12 forces DMY
    expect(parseDate("Sep 12, 2026")).toBe("2026-09-12");
    expect(parseDate("SEP 12", "MDY", 2026)).toBe("2026-09-12");
    expect(parseDate("12-Sep-26")).toBe("2026-09-12");
    expect(parseDate("09/12", "MDY", 2026)).toBe("2026-09-12");
    expect(parseDate("nonsense")).toBeNull();
  });

  it("parses signs in all the usual spellings", () => {
    expect(parseAmount("$1,234.50")).toBe(1234.5);
    expect(parseAmount("-12.00")).toBe(-12);
    expect(parseAmount("(12.00)")).toBe(-12);
    expect(parseAmount("12.00 CR")).toBe(-12);
    expect(parseAmount("12.00-")).toBe(-12);
    expect(parseAmount("abc")).toBeNull();
  });

  it("handles quoted CSV cells", () => {
    expect(csvRows('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  });
});

describe("CSV statements", () => {
  it("reads a header with a signed amount column and joins descriptions", () => {
    const csv = "Account Type,Account Number,Transaction Date,Cheque Number,Description 1,Description 2,CAD$,USD$\n" +
      "Visa,1234,9/12/2026,,COFFEE SHOP,ANYTOWN,-4.50,\nVisa,1234,9/15/2026,,PAYMENT - THANK YOU,,500.00,\n";
    expect(parseCsv(csv, card, "x.csv")).toEqual([
      { date: "2026-09-12", description: "COFFEE SHOP ANYTOWN", amount: -4.5, file: "x.csv" },
      { date: "2026-09-15", description: "PAYMENT - THANK YOU", amount: 500, file: "x.csv" },
    ]);
  });

  it("reads debit/credit columns and headerless CIBC-style rows", () => {
    expect(parseCsv("Date,Description,Withdrawals,Deposits\n2026-09-01,RENT,1500.00,\n2026-09-02,PAYROLL,,3000.00\n", chq, "y.csv").map((t) => t.amount)).toEqual([-1500, 3000]);
    expect(parseCsv("2026-09-03,GROCER,52.10,,4500********9999\n2026-09-05,PAYMENT,,200.00,4500********9999\n", card, "z.csv").map((t) => t.amount)).toEqual([-52.1, 200]);
  });

  it("can flip signs for banks that export purchases as positive", () => {
    expect(parseCsv("Date,Description,Amount\n2026-09-03,GROCER,52.10\n", { ...card, flipSign: true }, "f.csv")[0]!.amount).toBe(-52.1);
  });
});

describe("PDF statement lines", () => {
  it("reads card lines, CR credits, and rolls December back a year on a January statement", () => {
    const lines = [
      "Statement period Dec 23, 2025 to Jan 22, 2026",
      "DEC 28 DEC 29 GROCERY STORE #12 ANYTOWN ON 45.10",
      "JAN 05 JAN 06 PAYMENT THANK YOU 300.00 CR",
      "Total new charges 45.10",
    ];
    expect(parsePdfLines(lines, card, "s.pdf")).toEqual([
      { date: "2025-12-28", description: "GROCERY STORE #12 ANYTOWN ON", amount: -45.1, file: "s.pdf" },
      { date: "2026-01-05", description: "PAYMENT THANK YOU", amount: 300, file: "s.pdf" },
    ]);
  });

  it("takes bank-statement signs from the running balance", () => {
    const lines = ["Your statement Sep 1, 2026 to Sep 30, 2026", "Opening balance $1,000.00", "Sep 3 RENT 400.00 600.00", "Sep 15 PAYROLL 2,000.00 2,600.00"];
    expect(parsePdfLines(lines, chq, "b.pdf").map((t) => t.amount)).toEqual([-400, 2000]);
  });
});
