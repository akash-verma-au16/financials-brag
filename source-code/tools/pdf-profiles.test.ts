import { describe, expect, it } from "vitest";
import { rbcCredit, scotiaBank, scotiaCredit, type PdfLine } from "./pdf-profiles.ts";

describe("RBC credit card statements", () => {
  const it2 = (x: number, s: string) => ({ x, s });
  const line = (...items: { x: number; s: string }[]): PdfLine => ({ page: 1, x: items[0]!.x, text: items.map((i) => i.s).join(" "), items });
  const rbc: PdfLine[] = [
    line(it2(60, "RBC"), it2(90, "Visa")),
    line(it2(60, "Cardholder Name"), it2(150, "4500 00** **** 1234")),
    line(it2(60, "STATEMENT FROM DEC 09 TO JAN 07, 2026")),
    line(it2(59, "DEC 20"), it2(100, "DEC 22"), it2(178, "SOME GROCER ANYTOWN ON"), it2(330, "$54.10"), it2(391, "Previous Points balance"), it2(470, "1,000")),
    line(it2(128, "12345678901234567890123")),
    line(it2(59, "JAN 02"), it2(100, "JAN 03"), it2(178, "PAYMENT - THANK YOU / PAIEMENT - MERCI"), it2(330, "-$200.00")),
    line(it2(128, "12345678901234567890123")),
    line(it2(59, "JAN 05"), it2(100, "JAN 06"), it2(178, "FOREIGN SHOP"), it2(330, "$10.00")),
    line(it2(128, "USD 7.30 @ 1.369863")),
    line(it2(128, "12345678901234567890123"), it2(250, "Previous Account Balance"), it2(330, "$300.00")),
    line(it2(399, "Payments & credits"), it2(470, "-$200.00")),
    line(it2(128, "x"), it2(250, "Purchases & debits"), it2(330, "$64.10")),
    line(it2(391, "NEW BALANCE"), it2(470, "$164.10")),
  ];

  it("reads rows, credits, extra lines and the Dec→Jan year boundary; reconciles", () => {
    expect(rbcCredit.matches(rbc)).toBe(true);
    const r = rbcCredit.parse(rbc, { institution: "RBC", type: "credit" }, "r.pdf");
    expect(r.txns.map((t) => [t.date, t.amount])).toEqual([["2025-12-20", -54.1], ["2026-01-02", 200], ["2026-01-05", -10]]);
    expect(r.txns[2]!.description).toBe("FOREIGN SHOP USD 7.30 @ 1.369863");
    expect(r).toMatchObject({ period: ["2025-12-09", "2026-01-07"], last4: "1234", closingBalance: 164.1, check: "ok" });
  });
});

// Synthetic lines shaped like Scotiabank credit card statements (newer and older layouts).
const L = (text: string, x = 82, page = 1): PdfLine => ({ text, x, page });
const meta = { institution: "Scotiabank", type: "credit" };

const newLayout: PdfLine[] = [
  L("Statement Period Dec 11, 2025 - Jan 10, 2026", 379),
  L("Account # 4500 XXXX XXXX 1234", 379),
  L("Scotiabank Visa", 379),
  L("Previous balance, Dec 10/25 $100.00", 379),
  L("Payments/credits - $150.00", 379),
  L("Purchases/charges + $76.25", 379),
  L("Interest + $0.00", 379),
  L("New Balance = $26.25", 379),
  L("REF.# DETAILS AMOUNT($)"),
  L("001 Dec 28 Dec 29 GROCERY STORE #12 416-555-0100 45.10"),
  L("ON", 163),
  L("002 Jan 2 Jan 3 PAYMENT FROM - *****12*3456 150.00 -"),
  L("003 Jan 4 Jan 5 COFFEE PLACE ANYTOWN ON 6.15 See reverse for details."),
  L("Continued on page 3", 300),
  L("ABC - - 1 - 2 - 34 - - 004 Jan 9 Jan 9 BOOKSHOP ON 25.00", 32),
];

describe("Scotiabank credit card statements", () => {
  it("detects the layout and reads every row, sign and wrapped description", () => {
    expect(scotiaCredit.matches(newLayout)).toBe(true);
    const r = scotiaCredit.parse(newLayout, meta, "f.pdf");
    expect(r.txns).toEqual([
      { date: "2025-12-28", description: "GROCERY STORE #12 ON", amount: -45.1, file: "f.pdf" },
      { date: "2026-01-02", description: "PAYMENT FROM - *****12*3456", amount: 150, file: "f.pdf" },
      { date: "2026-01-04", description: "COFFEE PLACE ANYTOWN ON", amount: -6.15, file: "f.pdf" },
      { date: "2026-01-09", description: "BOOKSHOP ON", amount: -25, file: "f.pdf" },
    ]);
    expect(r).toMatchObject({ period: ["2025-12-11", "2026-01-10"], last4: "1234", closingBalance: 26.25, check: "ok" });
  });

  it("handles the older layout: attached '-' credits, CR balances, missing period start, cash advances", () => {
    const old: PdfLine[] = [
      L("Statement Period - Jan 12, 2023", 381),
      L("Scotiabank Visa", 72),
      L("Payments/credits - $200.00", 379),
      L("Purchases/charges + $300.00", 379),
      L("Cash advances + $100.00", 379),
      L("New balance = $40.00 CR", 379),
      L("REF.# DATE DATE DETAILS AMOUNT($)"),
      L("010 Dec 20 Dec 21 STORE ONE ON 300.00"),
      L("011 Jan 3 Jan 3 ATM - CASH ADVANCE BANK CASH 100.00"),
      L("012 Jan 5 Jan 5 PAYMENT FROM - 200.00-"),
      L("*****12* 3456", 159),
    ];
    const r = scotiaCredit.parse(old, meta, "o.pdf");
    expect(r.txns.map((t) => [t.date, t.amount])).toEqual([["2022-12-20", -300], ["2023-01-03", -100], ["2023-01-05", 200]]);
    expect(r.txns[2]!.description).toBe("PAYMENT FROM - *****12* 3456");
    expect(r.closingBalance).toBe(-40);
    expect(r.check).toBe("ok");
  });

  it("reports when rows are missing (credit)", () => {
    const r = scotiaCredit.parse(newLayout.filter((l) => !l.text.startsWith("003")), meta, "f.pdf");
    expect(r.check).toMatch(/charges differ/);
  });
});

// Chequing: one amount per row in the Withdrawn (x≈270) or Deposited (x≈340) column, then balance (x≈405).
const row = (date: string, desc: string, amount: string, amountX: number, balance?: string, extra?: string): PdfLine => {
  const items = [{ x: 73, s: date }, { x: 113, s: desc }, { x: amountX, s: amount }, ...(balance ? [{ x: 405, s: balance }] : []), ...(extra ? [{ x: 455, s: extra }] : [])];
  return { page: 1, x: 73, text: items.map((i) => i.s).join(" "), items };
};
const bank: PdfLine[] = [
  L("Opening Balance on August 27, 2026 $1,000.00", 73),
  L("Total total withdrawals $450.00", 85),
  L("Total total deposits $2,000.00", 85),
  L("Closing Balance on September 26, 2026 $2,550.00", 73),
  { page: 1, x: 73, text: "Date Transactions Withdrawn ($) Deposited ($) Balance ($)", items: [{ x: 73, s: "Date" }, { x: 113, s: "Transactions" }, { x: 252, s: "Withdrawn ($)" }, { x: 322, s: "Deposited ($)" }, { x: 395, s: "Balance ($)" }] },
  row("Aug 27", "Opening Balance", "1,000.00", 400),
  row("Aug 29", "Transfer to", "400.00", 278, undefined), // no balance: same-day row
  L("Credit Card", 113),
  row("Aug 29", "Service fee", "5.00", 290, "595.00"), // small amount starts right of its column
  row("Sep 2", "Deposit", "2,000.00", 343, "2,595.00", "Sidebar text here"), // sidebar merged
  row("Sep 9", "Withdrawal", "45.00", 285, "2,550.00"),
  L("SOME MARGIN CODE", 26),
  row("Sep 26", "Closing Balance", "$2,550.00", 396),
];

describe("Scotiabank chequing statements", () => {
  it("reads one-amount rows with signs from balance and column, wrapped details, sidebar noise", () => {
    expect(scotiaBank.matches(bank)).toBe(true);
    const r = scotiaBank.parse(bank, meta, "c.pdf");
    expect(r.txns.map((t) => [t.date, t.description, t.amount])).toEqual([
      ["2026-08-29", "Transfer to Credit Card", -400],
      ["2026-08-29", "Service fee", -5],
      ["2026-09-02", "Deposit", 2000],
      ["2026-09-09", "Withdrawal", -45],
    ]);
    expect(r).toMatchObject({ check: "ok", period: ["2026-08-27", "2026-09-26"], closingBalance: 2550 });
  });

  it("reports when rows are missing", () => {
    const r = scotiaCredit.parse(newLayout.filter((l) => !l.text.startsWith("003")), meta, "f.pdf");
    expect(r.check).toMatch(/charges differ/);
  });
});
