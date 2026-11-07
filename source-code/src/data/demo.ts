import type { CellValue } from "@/lib/sheets";
import type { SourceTables } from "./build";
import { toTable } from "./table";

/**
 * Generated, entirely fictional data in the exact Wealthica export layout. Used by demo mode
 * (Data page toggle) to preview the dashboards without signing in, and for visual checks.
 */

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function demoTables(today = new Date()): SourceTables {
  const r = rng(42);
  const asOf = iso(today);
  const accounts = [
    ["Maple Bank", "DEMO-CHQ-0001", "chequing", "Everyday Chequing", 6240.55],
    ["Maple Bank", "DEMO-SAV-0002", "savings", "High Interest Savings", 18200],
    ["Maple Bank", "DEMO-VISA-0003", "credit", "Rewards Visa", 1840.32],
    ["North Card", "DEMO-MC-0004", "credit", "", 412.9],
    ["Lakeside Invest", "DEMO-TFSA-05", "tfsa", "TFSA", 0],
    ["Lakeside Invest", "DEMO-RRSP-06", "rrsp", "RRSP", 0],
    ["Lakeside Invest", "DEMO-FHSA-07", "fhsa", "FHSA", 0],
    ["Lakeside Invest", "DEMO-CASH-08", "cash", "Non-registered", 0],
    ["Pinecrest Life", "DEMO-RPP-09", "rpp", "Group Pension Plan", 0],
  ] as const;

  const holdings: [acct: string, symbol: string, name: string, qty: number, price: number, cost: number][] = [
    ["DEMO-TFSA-05", "XEQT.TO", "ISHARES CORE EQUITY ETF PORTFOLIO", 820, 34.1, 26.5],
    ["DEMO-TFSA-05", "VFV.TO", "VANGUARD S&P 500 ETF", 95, 158.2, 112],
    ["DEMO-RRSP-06", "XAW.TO", "ISHARES CORE MSCI ALL COUNTRY WORLD EX CANADA", 410, 44.3, 36],
    ["DEMO-RRSP-06", "ZAG.TO", "BMO AGGREGATE BOND INDEX ETF", 300, 14.1, 14.9],
    ["DEMO-FHSA-07", "VGRO.TO", "VANGUARD GROWTH ETF PORTFOLIO", 260, 36.8, 33.2],
    ["DEMO-CASH-08", "RY.TO", "Royal Bank of Canada", 40, 182, 130],
    ["DEMO-CASH-08", "MSFT", "MICROSOFT CORP", 12, 610, 420],
    ["DEMO-CASH-08", "SCHD", "SCHWAB US DIVIDEND EQUITY ETF", 85, 38.5, 35.1],
    ["DEMO-CASH-08", "", "Cash", 0, 0, 0],
  ];

  const POS_H = ["Date", "Symbol", "Name", "Book Value", "Market Value", "Value", "Currency", "Quantity", "Category", "Institution", "Account Type", "Account Name", "Account Number", "Asset Class", "Groups"];
  const positions: CellValue[][] = [POS_H];
  const valueByAccount = new Map<string, number>();
  for (const [acct, symbol, name, qty, price, cost] of holdings) {
    const a = accounts.find((x) => x[1] === acct)!;
    const mv = symbol ? Math.round(qty * price * 100) / 100 : 1250.4;
    valueByAccount.set(acct, (valueByAccount.get(acct) ?? 0) + mv);
    positions.push([asOf, symbol, name, symbol ? Math.round(qty * cost * 100) / 100 : "", mv, symbol ? "" : mv, "CAD", symbol ? qty : "",
      symbol.endsWith(".TO") ? "Canadian Stocks" : symbol ? "US Stocks" : "", a[0], a[2], a[3], acct, symbol ? "Equities" : "Cash and Cash Equivalents", ""]);
  }
  positions.push([asOf, "", "Target Date 2055 Fund", "", 61800, "", "CAD", "", "", "Pinecrest Life", "rpp", "Group Pension Plan", "DEMO-RPP-09", "Others", ""]);
  valueByAccount.set("DEMO-RPP-09", 61800);

  const BAL_H = ["Date", "Institution", "Account Number", "Account Type", "Groups", "Account Name", "Account Currency", "Currency Balance", "Balance"];
  const balances: CellValue[][] = [BAL_H];
  for (const [inst, num, type, name, bal] of accounts) {
    const v = valueByAccount.get(num) ?? bal;
    balances.push([num === "DEMO-MC-0004" ? iso(addDays(today, -6)) : asOf, inst, num, type, "", name, "CAD", v, v]);
  }

  const TXN_H = ["Trade Date", "Settlement Date", "Type", "Institution/Asset", "Account Number", "Account Type", "Account Name", "Groups", "Description", "Account Currency", "Currency Amount", "Fee", "Symbol", "Quantity", "Category", "ID"];
  const txns: CellValue[][] = [TXN_H];
  let id = 0;
  const push = (d: Date, type: string, acct: string, desc: string, amount: number, symbol = "", qty: number | "" = "") => {
    const a = accounts.find((x) => x[1] === acct)!;
    txns.push([iso(d), iso(addDays(d, 1)), type, a[0], acct, a[2], a[3], "", desc, "CAD", Math.round(amount * 100) / 100, "", symbol, qty, "", `demo${++id}`]);
  };

  const merchants: [string, number, number][] = [
    ["LOBLAWS #1042", 60, 180], ["NO FRILLS 3321", 40, 120], ["TIM HORTONS #22", 3, 14], ["STARBUCKS 0815", 5, 12],
    ["UBER EATS", 22, 55], ["PRESTO AUTOLOAD", 20, 60], ["PETRO-CANADA 112", 45, 90], ["AMAZON.CA", 15, 140],
    ["SHOPPERS DRUG MART", 10, 60], ["CINEPLEX", 15, 40], ["THE CORNER BISTRO", 35, 110], ["DOLLARAMA", 5, 30],
  ];

  for (let m = 23; m >= 0; m--) {
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 1));
    const inMonth = (day: number) => addDays(monthStart, day - 1);
    if (inMonth(1) > today) break;
    for (const payday of [15, 28]) if (inMonth(payday) <= today) push(inMonth(payday), "Deposit", "DEMO-CHQ-0001", "PAYROLL NORTHWIND LTD", 3150 + Math.round(r() * 40));
    if (inMonth(1) <= today) push(inMonth(1), "Withdrawal", "DEMO-CHQ-0001", "RENT PAYMENT - E-TFR", -2150);
    if (inMonth(5) <= today) push(inMonth(5), "Withdrawal", "DEMO-CHQ-0001", "TORONTO HYDRO", -(70 + r() * 50));
    if (inMonth(8) <= today) push(inMonth(8), "Withdrawal", "DEMO-CHQ-0001", "ROGERS WIRELESS", -95.4);
    if (inMonth(12) <= today) push(inMonth(12), "Withdrawal", "DEMO-VISA-0003", "NETFLIX.COM", -20.99);
    if (inMonth(12) <= today) push(inMonth(12), "Withdrawal", "DEMO-VISA-0003", "SPOTIFY", -11.99);
    for (let i = 0; i < 22; i++) {
      const d = inMonth(1 + Math.floor(r() * 27));
      if (d > today) continue;
      const [desc, lo, hi] = merchants[Math.floor(r() * merchants.length)]!;
      push(d, "Withdrawal", r() < 0.8 ? "DEMO-VISA-0003" : "DEMO-MC-0004", desc, -(lo + r() * (hi - lo)));
    }
    // Card payments and savings: internal transfers (both legs).
    const pay = 1500 + Math.round(r() * 600);
    if (inMonth(20) <= today) {
      push(inMonth(20), "Withdrawal", "DEMO-CHQ-0001", "PAYMENT - MAPLE VISA", -pay);
      push(inMonth(22), "Deposit", "DEMO-VISA-0003", "PAYMENT THANK YOU", pay);
      push(inMonth(16), "Withdrawal", "DEMO-CHQ-0001", "TFR TO LAKESIDE", -500);
      push(inMonth(17), "Deposit", "DEMO-TFSA-05", "Contribution", 500);
      push(inMonth(18), "Buy", "DEMO-TFSA-05", "XEQT Bought 14", -480, "XEQT.TO", 14);
      push(inMonth(25), "Deposit", "DEMO-RPP-09", "Employer contribution", 640);
    }
    if (inMonth(27) <= today) {
      push(inMonth(27), "Dividend", "DEMO-CASH-08", "RY dividend", 41.2, "RY");
      push(inMonth(27), "Distribution", "DEMO-TFSA-05", "XEQT distribution", 18 + r() * 6, "XEQT.TO");
      push(inMonth(28), "Interest", "DEMO-SAV-0002", "INTEREST PAID", 45 + r() * 15);
      push(inMonth(28), "loan", "DEMO-CASH-08", "Stock lending", 0, "MSFT");
    }
    if (m % 3 === 0 && inMonth(26) <= today) {
      push(inMonth(26), "Dividend", "DEMO-CASH-08", "SCHD dividend", 48.1, "SCHD");
      push(inMonth(26), "Tax", "DEMO-CASH-08", "Withholding tax SCHD", -7.2, "SCHD");
    }
  }

  return { balances: [toTable(balances)], positions: [toTable(positions)], transactions: [toTable(txns)] };
}
