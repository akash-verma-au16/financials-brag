import { describe, expect, it } from "vitest";
import { keep } from "./demo-market.ts";

describe("demo market snapshot", () => {
  it("keeps market data but not news or search", () => {
    expect(keep("/api/market/holdings?symbols=XEQT.TO")).toBe(true);
    expect(keep("/api/market/news?symbol=XIC.TO&name=x")).toBe(false);
    expect(keep("/api/market/search?q=xic")).toBe(false);
    expect(keep("/api/statements")).toBe(false);
  });
});
