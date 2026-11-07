import { describe, expect, it } from "vitest";
import { parseSunLife } from "./sunlife-funds.ts";

const SAMPLE = `<html><body><template><fundName>Example Balanced Fund</fundName>
<overview><summary><firmName label="Firm Name" value="Example Asset Management"></firmName><benchmarkName label="Benchmark">Example Benchmark</benchmarkName>
<underlyingFund label="Underlying Fund" value="Example Underlying"></underlyingFund><fundType label="Fund Type">Balanced</fundType>
<inceptionDate label="Underlying Fund Inception Date" value="2001-02-03"></inceptionDate></summary><investmentRisk level="3">Moderate</investmentRisk></overview>
<performance><trailingReturns><data><n label="1-Year" timePeriod="Y1"><fund monthly="10.5" quarterly="10.5"></fund><index monthly="11.0" quarterly="11"></index></n>
<n label="3 Year" timePeriod="Y3"><fund monthly="7.25" quarterly="7"></fund><index monthly="8.25" quarterly="8"></index></n></data></trailingReturns></performance>
<portfolio><assetAllocation><n label="Canadian Equity" net="30"></n><n label="US Equity" net="30"></n><n label="Fixed Income" net="38"></n><n label="Cash" net="2"></n></assetAllocation>
<exposure><sector><n label="Cyclical"><n label="Financial Services" value="60"></n><n label="Real Estate" value="20"></n></n><n label="Defensive"><n label="HealthCare" value="20"></n></n></sector>
<country isArray="true"><n label="Canada" value="50"></n><n label="United States" value="50"></n></country></exposure>
<holdings isFundOfFund="true"><date label="Current Portfolio Date" value="2026-09-30"></date><data isArray="true"><n name="Example Bond Index A" country="Canada" weight="38"></n><n name="S&amp;P 500 Fund" country="United States" weight="62"></n></data></holdings></portfolio></template></body></html>`;

describe("parseSunLife", () => {
  it("reads mix, splits, holdings and returns", () => {
    const f = parseSunLife("ABCDEFGHIJ", SAMPLE)!;
    expect(f.name).toBe("Example Balanced Fund");
    expect(f.firm).toBe("Example Asset Management");
    expect(f.mix.stock).toBeCloseTo(0.6);
    expect(f.mix.bond).toBeCloseTo(0.38);
    expect(f.sectors).toEqual({ financial_services: 0.6, realestate: 0.2, healthcare: 0.2 });
    expect(f.countries.CA).toBeCloseTo(0.5);
    expect(f.holdings).toEqual([
      { name: "Example Bond Index A", country: "CA", weight: 0.38 },
      { name: "S&P 500 Fund", country: "US", weight: 0.62 },
    ]);
    expect(f.returns[1]).toEqual({ label: "3 Year", fund: 0.0725, index: 0.0825 });
    expect(f.asOf).toBe("2026-09-30");
  });
});
