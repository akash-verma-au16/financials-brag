import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_BY_ID, DEFAULT_RULES, PARENT_BY_ID, categorise } from "./categories";

// Descriptions shaped like real card/bank lines (synthetic).
const out = (d: string, type = "credit") => categorise(d, -10, type);
const inn = (d: string, type = "chequing") => categorise(d, 10, type);

describe("dictionary integrity", () => {
  it("every rule points at a real category with a real parent", () => {
    for (const r of DEFAULT_RULES) expect(CATEGORY_BY_ID.has(r.category), r.category).toBe(true);
    for (const c of CATEGORIES) expect(PARENT_BY_ID.has(c.parent), c.id).toBe(true);
  });
});

describe("categorise", () => {
  it("prefers the longest keyword", () => {
    expect(out("UBER* EATS TORONTO")).toBe("food-delivery");
    expect(out("UBER* TRIP HELP.UBER.COM")).toBe("rideshare");
    expect(out("COSTCO GAS W123")).toBe("fuel");
    expect(out("COSTCO WHOLESALE W123")).toBe("groceries");
    expect(out("AMAZON PRIME*AB12C")).toBe("streaming");
    expect(out("AMZN MKTP CA*AB12C")).toBe("online-shopping");
  });

  it("reads payment-processor prefixes", () => {
    expect(out("TST* SOME LOCAL SPOT TORONTO ON")).toBe("restaurants");
    expect(out("DD *DOORDASH SOMEPLACE")).toBe("food-delivery");
    expect(out("IC* INSTACART")).toBe("groceries-online");
  });

  it("separates Interac in/out, bill payments and card payments", () => {
    expect(inn("e-Transfer - Autodeposit JOHN")).toBe("interac-in");
    expect(categorise("INTERAC E-TRANSFER SENT JANE", -50, "chequing")).toBe("interac-out");
    expect(categorise("BILL PAYMENT SOME UTILITY CO", -80, "chequing")).toBe("bill-payments");
    expect(categorise("BILL PAYMENT TORONTO HYDRO", -80, "chequing")).toBe("utilities");
    expect(inn("PAYMENT FROM - *****12*3456", "credit")).toBe("card-payment");
    expect(categorise("SCOTIA VISA PAYMENT", -500, "chequing")).toBe("card-payment");
  });

  it("falls back to in-store / online purchases instead of uncategorised", () => {
    expect(out("XYZQ HOLDINGS 416-555-0100 ON")).toBe("in-store");
    expect(out("SOMESHOP.COM 800-555-0100")).toBe("online-purchase");
    expect(categorise("MISC 12345", -10, "chequing")).toBe("uncategorised");
  });

  it("nets a return against the merchant's category; unknown card credits are refunds", () => {
    expect(categorise("AMAZON.CA RETURN", 25, "credit")).toBe("online-shopping");
    expect(categorise("XQZ HOLDINGS", 25, "credit")).toBe("refunds");
    expect(categorise("MB-CREDIT CARD/LOC PAY. FROM - *****12*3456", 300, "credit")).toBe("card-payment");
  });

  it("handles bank-statement wording: card payments, gig payouts, government", () => {
    expect(categorise("Customer PAYMENT CIBC MASTERCARD", -400, "chequing")).toBe("card-payment");
    expect(categorise("MISC. PAYMENT UBER CANADA/UBERE", 85, "chequing")).toBe("side-income");
    expect(categorise("MISC. PAYMENT DOORDASH, INC", 60, "chequing")).toBe("side-income");
    expect(categorise("DOORDASH*SOMEPLACE", 12, "credit")).toBe("food-delivery"); // a card refund, not income
    expect(categorise("PROVINCIAL PAYMENT CANADA", 120, "chequing")).toBe("gov");
    expect(categorise("GST CANADA", 120, "chequing")).toBe("gov");
  });

  it("keeps the word-start rule for short keywords", () => {
    expect(out("PHONEBOX WIRELESS")).not.toBe("restaurants"); // "PHO " ≠ "PHONE"
    expect(out("SKIN CARE CLINIC")).not.toBe("events"); // "SKI " ≠ "SKIN"
    expect(out("BELLA ITALIA RISTORANTE")).not.toBe("phone-internet"); // "BELL " ≠ "BELLA"
  });
});
