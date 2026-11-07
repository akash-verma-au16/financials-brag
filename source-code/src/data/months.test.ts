import { describe, expect, it } from "vitest";
import { addMonths, describeMonths, expectedMonth, monthPace, monthsBetween, previousMonths, projectYear, shiftMonths, spanOf, yearEarlier } from "./months";

describe("month selections", () => {
  it("does month arithmetic across years", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2025-11", 3)).toBe("2026-02");
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(spanOf(["2026-03", "2026-01"])).toEqual(["2026-01-01", "2026-03-31"]);
    expect(spanOf(["2024-02"])).toEqual(["2024-02-01", "2024-02-29"]);
  });

  it("finds the previous period and the same months a year earlier", () => {
    expect(previousMonths(["2026-10"])).toEqual(["2026-09"]);
    expect(previousMonths(["2026-03", "2026-04", "2026-05"])).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(previousMonths(["2026-01", "2026-03"])).toEqual(["2025-10", "2025-12"]); // span of 3
    expect(yearEarlier(["2026-01", "2026-07"])).toEqual(["2025-01", "2025-07"]);
    expect(shiftMonths(["2025-01", "2025-12"], -1)).toEqual(["2024-01", "2024-12"]);
  });

  it("describes selections", () => {
    expect(describeMonths([])).toBe("No months selected");
    expect(describeMonths(monthsBetween("2025-01", "2025-12"))).toBe("2025");
    expect(describeMonths(["2025-01", "2025-05", "2026-02"])).toBe("3 months in 2025–2026");
  });
});

describe("projections", () => {
  const h = new Map<string, number>([
    ...monthsBetween("2026-03", "2026-08").map((m) => [m, 1000] as [string, number]),
    ["2025-12", 3000],
  ]);
  it("blends the trailing average with the same month last year", () => {
    expect(expectedMonth(h, "2026-11", "2026-09")).toBe(1000); // no Nov last year
    expect(expectedMonth(h, "2026-12", "2026-09")).toBe(2000); // (1000 + 3000) / 2
  });

  it("projects the current month from spending so far plus the days left", () => {
    expect(monthPace(600, 1000, "2026-09-15")).toBeCloseTo(600 + 1000 * (15 / 30));
    expect(monthPace(600, 1000, "2026-09-30")).toBe(600);
  });

  it("projects a whole year: actuals, pace, then expected", () => {
    const h2 = new Map(h).set("2026-09", 500);
    const y = projectYear(h2, 2026, "2026-09-10");
    expect(y[2]).toEqual({ month: "2026-03", value: 1000, projected: false });
    expect(y[8]!.projected).toBe(true);
    expect(y[8]!.value).toBeCloseTo(500 + 1000 * (20 / 30));
    expect(y[11]).toEqual({ month: "2026-12", value: 2000, projected: true });
  });
});
