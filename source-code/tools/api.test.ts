import { describe, expect, it } from "vitest";
import { apiHandler, isReadable, isWritable } from "./api.ts";

describe("private-file API", () => {
  it("only reaches allowlisted paths", () => {
    expect(isReadable("statements/example-bank-chequing/2025/2025-01.pdf")).toBe(true);
    expect(isReadable("config/settings.json")).toBe(true);
    expect(isReadable(".env.local")).toBe(false);
    expect(isReadable("statements/../.env.local")).toBe(false);
    expect(isReadable("C:/Windows/win.ini")).toBe(false);
    expect(isWritable("statements/new-card/account.yaml")).toBe(true);
    expect(isWritable("statements/x/2026/2026-01.pdf")).toBe(true);
    expect(isWritable("src/App.tsx")).toBe(false);
    expect(isWritable("statements/x/evil.exe")).toBe(false);
    expect(isWritable("contribution-limits.yaml")).toBe(false);
  });

  it("refuses requests without a Google token", async () => {
    const handler = apiHandler({ root: ".", allowedEmails: ["me@example.com"], clientId: "x" });
    const res = { statusCode: 0, body: "", setHeader() {}, end(b: string) { this.body = b; } };
    await handler({ url: "/api/statements", method: "GET", headers: {} } as never, res as never, () => {});
    expect(res.statusCode).toBe(401);
    let passed = false;
    await handler({ url: "/spending", method: "GET", headers: {} } as never, res as never, () => (passed = true));
    expect(passed).toBe(true);
  });
});
