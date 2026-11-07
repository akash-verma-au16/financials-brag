import { describe, expect, it } from "vitest";
import type { CellValue } from "@/lib/sheets";
import { buildDataset, matchTransfers } from "./build";
import { categorise } from "./categories";
import { classifyInstrument, symbolCanonicaliser } from "./instruments";
import type { BuildSettings } from "./settings";
import { detectKind, toTable } from "./table";
import type { Transaction } from "./model";
import { demoTables } from "./demo";
import { holdings } from "./holdings";
import { netWorth, scopeAccounts } from "./select";

// Synthetic fixtures shaped like the Wealthica exports. No real data.
const BAL_H = ["Date", "Institution", "Account Number", "Account Type", "Groups", "Account Name", "Account Currency", "Currency Balance", "Balance"];
const POS_H = ["Date", "Symbol", "Name", "Book Value", "Market Value", "Value", "Currency", "Quantity", "Category", "Institution", "Account Type", "Account Name", "Account Number", "Asset Class", "Groups"];
const TXN_H = ["Trade Date", "Settlement Date", "Type", "Institution/Asset", "Account Number", "Account Type", "Account Name", "Groups", "Description", "Account Currency", "Currency Amount", "Fee", "Symbol", "Quantity", "Category", "ID"];

const balances: CellValue[][] = [
  BAL_H,
  ["2026-10-13", "Bank A", "111-222", "chequing", "", "Everyday", "CAD", 5000, 5000],
  ["2026-10-13", "Bank A", "4500********9999", "credit", "", "", "CAD", 1200, 1200],
  ["2026-10-13", "Broker B", "XX1CAD", "tfsa", "", "", "CAD", 20000, 20000],
  ["2026-10-13", "Broker B", "XX2CAD", "cash", "", "", "CAD", 3000, 3000],
  ["2026-10-01", "Insurer C", "777", "rpp", "", "Pension Plan", "CAD", 40000, 40000],
];
const positions: CellValue[][] = [
  POS_H,
  ["2026-10-13", "VFV.TO", "VANGUARD S&P 500 ETF", 9000, 10000, "", "CAD", 70, "Canadian Stocks", "Broker B", "tfsa", "", "XX1CAD", "Equities", ""],
  ["2026-10-13", "BNS.TO", "Bank of Nova Scotia", 2000, 2500, "", "CAD", 30, "Canadian Stocks", "Broker B", "cash", "", "XX2CAD", "Equities", ""],
  ["2026-10-13", "", "Cash", "", 500, 500, "CAD", "", "", "Broker B", "cash", "", "XX2CAD", "Cash and Cash Equivalents", ""],
  ["2026-10-01", "", "Target Date 2045 Fund", "", 40000, "", "CAD", "", "", "Insurer C", "rpp", "", "777", "Others", ""],
];
const tx = (date: string, type: string, inst: string, num: string, acctType: string, desc: string, amount: number, symbol = "", id = `${date}-${desc}-${amount}`) =>
  [date, date, type, inst, num, acctType, "", "", desc, "CAD", amount, "", symbol, "", "", id] as CellValue[];
const transactions: CellValue[][] = [
  TXN_H,
  tx("2026-09-01", "Deposit", "Bank A", "111-222", "chequing", "PAYROLL ACME CORP", 2000),
  tx("2026-09-03", "Withdrawal", "Bank A", "111-222", "chequing", "LOBLAWS #123", -42.1),
  tx("2026-09-05", "Withdrawal", "Bank A", "111-222", "chequing", "PAYMENT CARD", -500),
  tx("2026-09-07", "Deposit", "Bank A", "4500********9999", "credit", "PAYMENT THANK YOU", 500),
  tx("2026-09-08", "Withdrawal", "Bank A", "4500********9999", "credit", "NETFLIX.COM", 16.99), // positive withdrawal → normalised negative
  tx("2026-09-10", "Deposit", "Broker B", "XX1CAD", "tfsa", "Contribution", 1000),
  tx("2026-09-15", "Dividend", "Broker B", "XX2CAD", "cash", "BNS dividend", 30, "BNS"),
  tx("2026-09-16", "loan", "Broker B", "XX2CAD", "cash", "Stock lending", 0, "BNS"),
  tx("2026-09-16", "loan", "Broker B", "XX2CAD", "cash", "Stock lending", 0, "BNS"), // same generated ID → duplicate
];

const settings: BuildSettings = {
  people: [{ id: "me", name: "Me" }, { id: "p2", name: "Partner" }],
  accountOwners: {},
  accountLabels: {},
  instrumentOverrides: {},
  rules: [],
};

const build = (s: BuildSettings = settings) =>
  buildDataset(
    { balances: [toTable(balances)], positions: [toTable(positions)], transactions: [toTable(transactions)] },
    s,
  );

describe("detectKind", () => {
  it("identifies each export by its headers", () => {
    expect(detectKind(toTable([BAL_H]))).toBe("balances");
    expect(detectKind(toTable([POS_H]))).toBe("positions");
    expect(detectKind(toTable([TXN_H]))).toBe("transactions");
    expect(detectKind(toTable([["Foo", "Bar"]]))).toBeNull();
  });
});

describe("accounts", () => {
  const ds = build();
  const byType = (t: string) => ds.accounts.find((a) => a.type === t)!;

  it("treats credit balances as negative debt", () => {
    expect(byType("credit").bucket).toBe("debt");
    expect(byType("credit").balance).toBe(-1200);
  });

  it("buckets by type, and a cash account holding securities as investments", () => {
    expect(byType("chequing").bucket).toBe("cash");
    expect(byType("tfsa").bucket).toBe("investments");
    expect(byType("cash").bucket).toBe("investments");
    expect(byType("rpp").bucket).toBe("retirement");
    expect(byType("tfsa").tax).toBe("tax-free");
    expect(byType("rpp").tax).toBe("tax-deferred");
  });

  it("derives a display name and never keeps the raw account number", () => {
    expect(byType("credit").name).toBe("Bank A Credit card ··9999");
    expect(byType("chequing").name).toBe("Everyday");
    expect(JSON.stringify(ds.accounts)).not.toContain("111-222");
  });

  it("applies owner and label settings, defaulting to the first person", () => {
    expect(byType("tfsa").owners).toEqual(["me"]);
    const key = byType("tfsa").key;
    const ds2 = build({ ...settings, accountOwners: { [key]: ["me", "p2"] }, accountLabels: { [key]: "Our TFSA" } });
    const tfsa = ds2.accounts.find((a) => a.key === key)!;
    expect(tfsa.owners).toEqual(["me", "p2"]);
    expect(tfsa.name).toBe("Our TFSA");
  });

  it("flags accounts that haven't synced recently", () => {
    expect(ds.issues.some((i) => i.message.includes("Pension Plan"))).toBe(true);
  });

  it("moves closed accounts out of the present but keeps their transactions", () => {
    const rpp = byType("rpp").key;
    const chq = byType("chequing").key;
    const ds2 = build({ ...settings, closedAccounts: { [rpp]: "2026-10-01", [chq]: "2026-10-13" } });
    expect(ds2.accounts.map((a) => a.key)).not.toContain(rpp);
    expect(ds2.accounts.map((a) => a.key)).not.toContain(chq);
    expect(ds2.closedAccounts?.map((a) => [a.type, a.closedOn])).toEqual([
      ["chequing", "2026-10-13"],
      ["rpp", "2026-10-01"],
    ]);
    expect(ds2.positions.some((p) => p.accountKey === rpp)).toBe(false);
    expect(ds2.transactions.filter((t) => t.accountKey === chq)).toHaveLength(ds.transactions.filter((t) => t.accountKey === chq).length);
    expect(ds2.issues.some((i) => i.message.includes("Pension Plan"))).toBe(false);
  });
});

describe("transactions", () => {
  const ds = build();
  const find = (desc: string) => ds.transactions.find((t) => t.description === desc)!;

  it("matches a card payment as an internal transfer", () => {
    expect(find("PAYMENT CARD").kind).toBe("transfer");
    expect(find("PAYMENT THANK YOU").kind).toBe("transfer");
    expect(find("PAYMENT CARD").transferPeer).toBe(find("PAYMENT THANK YOU").id);
  });

  it("categorises household flows and normalises withdrawal signs", () => {
    expect(find("PAYROLL ACME CORP")).toMatchObject({ kind: "flow", category: "salary", amount: 2000 });
    expect(find("LOBLAWS #123")).toMatchObject({ kind: "flow", category: "groceries" });
    expect(find("NETFLIX.COM")).toMatchObject({ kind: "flow", category: "streaming", amount: -16.99 });
  });

  it("classifies investment-account rows", () => {
    expect(find("Contribution").kind).toBe("contribution");
    expect(find("BNS dividend").kind).toBe("investment-income");
    expect(find("Stock lending").kind).toBe("ignore");
  });

  it("dedupes by ID and canonicalises bare TSX symbols", () => {
    expect(ds.transactions.filter((t) => t.description === "Stock lending")).toHaveLength(1);
    expect(find("BNS dividend").symbol).toBe("BNS.TO");
  });
});

describe("matchTransfers", () => {
  const t = (id: string, accountKey: string, date: string, amount: number): Transaction => ({
    id, accountKey, date, settleDate: date, amount, type: "transfer", description: "", symbol: null, quantity: null, kind: "ignore",
  });

  it("requires different accounts and a date window", () => {
    const pairs = matchTransfers([
      t("a", "x", "2026-01-01", -100),
      t("b", "x", "2026-01-01", 100), // same account: not a transfer
      t("c", "y", "2026-01-20", 100), // too far apart
    ]);
    expect(pairs.size).toBe(0);
  });

  it("picks the closest date when several legs match", () => {
    const pairs = matchTransfers([t("a", "x", "2026-01-01", -100), t("b", "x", "2026-01-04", -100), t("c", "y", "2026-01-05", 100)]);
    expect(pairs.get("c")).toBe("b");
  });
});

describe("instruments", () => {
  it("looks through ETFs and classifies untickered funds by name", () => {
    expect(classifyInstrument("VFV.TO", "VANGUARD S&P 500 ETF")).toMatchObject({ assetClass: "equity", region: "US", vehicle: "etf" });
    expect(classifyInstrument("XRE.TO", "ISHARES S&P/TSX REIT")).toMatchObject({ assetClass: "real-estate", region: "CA" });
    expect(classifyInstrument("INFY", "INFOSYS LTD-SPON ADR")).toMatchObject({ region: "emerging", vehicle: "stock" });
    expect(classifyInstrument(null, "Target Date 2045 Fund")).toMatchObject({ assetClass: "balanced", vehicle: "fund" });
    expect(classifyInstrument(null, "Cash")).toMatchObject({ assetClass: "cash" });
    expect(classifyInstrument("MSFT", "MICROSOFT CORP", { region: "global" }).region).toBe("global");
  });

  it("only maps bare symbols when the suffixed form exists", () => {
    const canon = symbolCanonicaliser(["ENB.TO", "T"]);
    expect(canon("ENB")).toBe("ENB.TO");
    expect(canon("T")).toBe("T");
    expect(canon("")).toBeNull();
  });
});

describe("statement accounts", () => {
  const withStatements = buildDataset(
    {
      balances: [toTable(balances)],
      positions: [toTable(positions)],
      transactions: [toTable(transactions)],
      statements: [
        {
          folder: "bank-a-card",
          meta: { institution: "Bank A", type: "credit", last4: "9999" },
          files: [],
          txns: [
            { date: "2026-09-09", description: "NETFLIX.COM", amount: -16.99, file: "a.csv" }, // already in Wealthica (1 day apart)
            { date: "2026-08-20", description: "BOOKSTORE", amount: -30, file: "a.csv" }, // missing from Wealthica
          ],
        },
        {
          folder: "other-card",
          meta: { institution: "Bank Z", type: "credit", name: "Z Visa", balance: 250 },
          files: [],
          txns: [{ date: "2026-09-10", description: "TIM HORTONS", amount: -5, file: "b.csv" }],
        },
      ],
    },
    settings,
  );

  it("merges into the Wealthica account by institution + last 4 and skips duplicates", () => {
    const card = withStatements.accounts.find((a) => a.last4 === "9999")!;
    expect(card.source).toBe("wealthica+statements");
    const cardTxns = withStatements.transactions.filter((t) => t.accountKey === card.key);
    expect(cardTxns.filter((t) => t.description === "NETFLIX.COM")).toHaveLength(1);
    expect(cardTxns.find((t) => t.description === "BOOKSTORE")).toMatchObject({ kind: "flow", amount: -30 });
  });

  it("adds unmatched folders as their own accounts with the yaml balance as debt", () => {
    const z = withStatements.accounts.find((a) => a.name === "Z Visa")!;
    expect(z).toMatchObject({ source: "statements", bucket: "debt", balance: -250 });
    expect(withStatements.transactions.find((t) => t.accountKey === z.key)).toMatchObject({ category: "coffee" });
  });
});

describe("circle and statement matching", () => {
  it("treats transfers to/from people in your circle as moving money", () => {
    const tbl = toTable([
      TXN_H,
      tx("2026-09-20", "Withdrawal", "Bank A", "111-222", "chequing", "INTERAC E-TRANSFER SENT JANE Q PUBLIC", -300),
      tx("2026-09-21", "Withdrawal", "Bank A", "111-222", "chequing", "INTERAC E-TRANSFER SENT LANDLORD CO", -1800),
    ]);
    const ds = buildDataset({ balances: [toTable(balances)], positions: [], transactions: [tbl] }, { ...settings, circle: ["Jane Q Public"] });
    expect(ds.transactions.find((t) => t.description.includes("JANE"))!.category).toBe("circle-transfer");
    expect(ds.transactions.find((t) => t.description.includes("LANDLORD"))!.category).toBe("interac-out");
  });

  it("merges a statement folder into the only account of that type at the bank", () => {
    const ds = buildDataset(
      {
        balances: [toTable(balances)],
        positions: [],
        transactions: [],
        statements: [{ folder: "bank-a-chq", meta: { institution: "Bank A", type: "chequing" }, files: [], txns: [{ date: "2026-09-01", description: "RENT", amount: -1000, file: "x" }], latestBalance: { date: "2026-09-30", balance: 999 } }],
      },
      settings,
    );
    expect(ds.accounts.filter((a) => a.institution === "Bank A" && a.type === "chequing")).toHaveLength(1);
    expect(ds.accounts.find((a) => a.type === "chequing")!.balance).toBe(5000); // Wealthica balance kept, not doubled
  });
});

describe("holdings and per-person scope", () => {
  const ds = build();
  const tfsaKey = ds.accounts.find((a) => a.type === "tfsa")!.key;
  const joint = build({ ...settings, accountOwners: { [tfsaKey]: ["me", "p2"] } });

  it("merges lots and only reports a gain when every lot has a cost", () => {
    const hs = holdings(ds, "all");
    expect(hs[0]!.instrument.name).toBe("Target Date 2045 Fund");
    expect(hs[0]!.gain).toBeNull();
    const vfv = hs.find((h) => h.instrument.symbol === "VFV.TO")!;
    expect(vfv.gain).toBe(1000);
    expect(hs.reduce((s, h) => s + h.weight, 0)).toBeCloseTo(1);
  });

  it("splits joint accounts equally so people sum to the household", () => {
    const all = netWorth(scopeAccounts(joint, "all")).net;
    const me = netWorth(scopeAccounts(joint, "me")).net;
    const partner = netWorth(scopeAccounts(joint, "p2")).net;
    expect(partner).toBe(10000);
    expect(me + partner).toBeCloseTo(all);
    expect(holdings(joint, "p2").find((h) => h.instrument.symbol === "VFV.TO")!.marketValue).toBe(5000);
  });
});

describe("demo data", () => {
  it("builds a consistent dataset", () => {
    const ds = buildDataset(demoTables(new Date("2026-10-13T12:00:00Z")), settings);
    expect(ds.accounts).toHaveLength(9);
    expect(ds.accounts.every((a) => Number.isFinite(a.balance))).toBe(true);
    // Every card payment and TFSA contribution is matched as an internal transfer.
    const payments = ds.transactions.filter((t) => t.description.startsWith("PAYMENT"));
    expect(payments.length).toBeGreaterThan(0);
    expect(payments.every((t) => t.kind === "transfer")).toBe(true);
    expect(ds.transactions.find((t) => t.description === "Employer contribution")?.kind).toBe("contribution");
  });
});

describe("categorise", () => {
  it("prefers user rules and handles refunds on cards", () => {
    expect(categorise("SOME MERCHANT", -10, "chequing", [{ match: "some merchant", category: "clothing" }])).toBe("clothing");
    expect(categorise("CURRENT ACCT", -10, "chequing")).not.toBe("rent"); // "RENT" only at a word start
    expect(categorise("CAMPBELL ST", -10, "chequing")).toBe("uncategorised");
    expect(categorise("SHOPPERS DRUG MART", -10, "chequing")).toBe("pharmacy"); // longest keyword wins
    expect(categorise("RENT OCT", -1500, "chequing", [{ match: "/^RENT\\b/", category: "housing" }])).toBe("rent"); // legacy id mapped
    expect(categorise("STORE RETURN", 25, "credit")).toBe("refunds");
    expect(categorise("STORE RETURN", 25, "chequing")).toBe("other-income");
  });
});

describe("statement accounts Wealthica can't sync", () => {
  const card = (meta: Record<string, unknown>) => ({
    folder: "card-z",
    meta: { institution: "Bank Z", type: "credit", name: "Z Card", ...meta },
    files: [],
    txns: [
      { date: "2026-10-20", description: "PAYMENT", amount: 100, file: "card-z/2026.csv" },
      { date: "2026-10-05", description: "GROCER", amount: -80.25, file: "card-z/2026.csv" },
      { date: "2026-07-14", description: "BOOKSHOP", amount: -40, file: "card-z/2026.csv" },
    ],
  });
  const build2 = (meta: Record<string, unknown>) =>
    buildDataset({ balances: [toTable(balances)], positions: [], transactions: [], statements: [card(meta)] }, settings).accounts.find((a) => a.name === "Z Card")!;

  it("works out the amount owed from an opening balance and every transaction since", () => {
    expect(build2({ openingBalance: 0 })).toMatchObject({ bucket: "debt", balance: -20.25, asOf: "2026-10-20", source: "statements" });
    expect(build2({ openingBalance: 10 }).balance).toBe(-30.25);
  });

  it("prefers a balance written in account.yaml", () => {
    expect(build2({ openingBalance: 0, balance: 55, balanceDate: "2026-10-31" })).toMatchObject({ balance: -55, asOf: "2026-10-31" });
  });

  it("counts as $0 with a note when nothing gives a balance", () => {
    expect(build2({}).balance).toBe(0);
  });
});
