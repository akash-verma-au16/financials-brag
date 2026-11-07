import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { consolidateLedgers, mergeLedger } from "./ledger.ts";
import { parseCsv } from "./parse-core.ts";

// Synthetic rows in the Wealthsimple credit card export layout. No real data.
const H = "transaction_date,transaction_type,status,merchant,amount,currency,notes,category";
const csv = (...rows: string[]) => [H, ...rows].join("\n");
const r = (date: string, merchant: string, amount: string, type = "Purchase", status = "Completed") => `${date},${type},${status},${merchant},${amount},CAD,,Shopping`;

const lines = (text: string) => text.trim().split("\n").slice(1);

describe("mergeLedger", () => {
  it("starts a master per year from the first export, oldest first", () => {
    const out = mergeLedger(new Map(), csv(r("2026-08-02", "CAFE", "-4.50"), r("2025-12-30", "BOOKS", "-20.00"), r("2026-07-15", "GROCER", "-61.10")));
    expect([...out.masters.keys()]).toEqual(["2025", "2026"]);
    expect(lines(out.masters.get("2026")!).map((l) => l.slice(0, 10))).toEqual(["2026-07-15", "2026-08-02"]);
    expect(out.years.find((y) => y.year === "2026")).toMatchObject({ added: 2, alreadyThere: 0 });
  });

  it("adds only what's new after the master's last date, keeping same-day repeats", () => {
    const master = csv(r("2026-07-15", "GROCER", "-61.10"), r("2026-08-02", "CAFE", "-4.50"));
    const later = csv(
      r("2026-07-15", "GROCER", "-61.10"), // already there
      r("2026-08-02", "CAFE", "-4.50"), // already there (last day)
      r("2026-08-02", "CAFE", "-4.50"), // a second identical coffee that day: new
      r("2026-08-09", "PHARMACY", "-12.00"), // new
      r("2026-08-09", "PAYMENT", "66.00", "Payment"), // new
    );
    const out = mergeLedger(new Map([["2026", master]]), later);
    expect(out.years[0]).toMatchObject({ year: "2026", added: 3, alreadyThere: 2, olderSkipped: 0 });
    expect(lines(out.masters.get("2026")!)).toHaveLength(5);

    // Merging the same export again changes nothing.
    const again = mergeLedger(new Map([["2026", out.masters.get("2026")!]]), later);
    expect(again.masters.size).toBe(0);
    expect(again.years[0]).toMatchObject({ added: 0, alreadyThere: 5 });
  });

  it("never rewrites history: rows before the last date that the master lacks are left out", () => {
    const master = csv(r("2026-08-02", "CAFE", "-4.50"), r("2026-08-09", "PHARMACY", "-12.00"));
    const out = mergeLedger(new Map([["2026", master]]), csv(r("2026-08-05", "CAFE RENAMED", "-4.50"), r("2026-08-10", "GAS", "-40.00")));
    expect(out.years[0]).toMatchObject({ added: 1, olderSkipped: 1 });
    expect(out.masters.get("2026")).not.toContain("CAFE RENAMED");
  });

  it("skips rows that haven't settled", () => {
    const out = mergeLedger(new Map(), csv(r("2026-08-02", "CAFE", "-4.50"), r("2026-08-03", "HOTEL", "-300.00", "Purchase", "Pending")));
    expect(out.pending).toBe(1);
    expect(out.masters.get("2026")).not.toContain("HOTEL");
  });

  it("keeps commas and quotes intact", () => {
    const out = mergeLedger(new Map(), csv(`2026-08-02,Purchase,Completed,"SHOP, ""THE"" ONE",-9.99,CAD,,Shopping`));
    const txns = parseCsv(out.masters.get("2026")!, { institution: "Wealthsimple", type: "credit" }, "x/2026.csv");
    expect(txns).toEqual([{ date: "2026-08-02", description: 'SHOP, "THE" ONE', amount: -9.99, file: "x/2026.csv" }]);
  });

  it("reads the export's underscore headers as transactions", () => {
    const txns = parseCsv(csv(r("2026-08-09", "PAYMENT", "66.00", "Payment")), { institution: "Wealthsimple", type: "credit" }, "f.csv");
    expect(txns).toMatchObject([{ date: "2026-08-09", description: "PAYMENT", amount: 66 }]);
  });
});

describe("consolidateLedgers", () => {
  let dir = "";
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("merges exports in ledger folders into the yearly masters and deletes them", async () => {
    dir = await mkdtemp(join(tmpdir(), "ledger-"));
    const card = join(dir, "card");
    await mkdir(card);
    await writeFile(join(card, "account.yaml"), "institution: Wealthsimple\ntype: credit\nledger: yearly\n");
    await writeFile(join(card, "2026.csv"), csv(r("2026-08-02", "CAFE", "-4.50")) + "\n");
    await writeFile(join(card, "credit-card-activities-2026-09-01.csv"), csv(r("2026-08-02", "CAFE", "-4.50"), r("2026-08-20", "GAS", "-40.00")));
    const other = join(dir, "bank");
    await mkdir(other);
    await writeFile(join(other, "account.yaml"), "institution: Bank\ntype: chequing\n");
    await writeFile(join(other, "export.csv"), csv(r("2026-08-02", "X", "-1.00")));

    const res = await consolidateLedgers(dir);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ folder: "card", file: "credit-card-activities-2026-09-01.csv", changed: ["statements/card/2026.csv", "statements/card/credit-card-activities-2026-09-01.csv"] });
    expect(await readdir(card)).toEqual(["2026.csv", "account.yaml"]);
    expect(lines(await readFile(join(card, "2026.csv"), "utf8"))).toHaveLength(2);
    expect(await readdir(other)).toContain("export.csv"); // not a ledger folder: untouched
  });
});
