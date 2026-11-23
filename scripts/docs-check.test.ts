import { describe, expect, it } from "vitest";
import { missingDocs } from "./docs-check-lib";

describe("missingDocs", () => {
  it("docs-only PR needs nothing", () => {
    expect(missingDocs(["README.md", "docs/reports/2026-11-23.md"])).toEqual([]);
  });

  it("tooling-only PR (no src/messages) needs nothing", () => {
    expect(missingDocs(["package-lock.json", ".github/workflows/ci.yml", "scripts/x.ts"])).toEqual([]);
  });

  it("code change without docs lists all three", () => {
    expect(missingDocs(["src/app/page.tsx"])).toHaveLength(3);
  });

  it("text change in messages counts as code", () => {
    expect(missingDocs(["messages/th.json", "CHANGELOG.md"])).toHaveLength(2);
  });

  it("code + CHANGELOG + PROCESS + contract passes (Windows paths too)", () => {
    expect(missingDocs(["src\\lib\\a.ts", "CHANGELOG.md", "PROCESS.md", "CR2_SIGNOUT_CONFIRM_CONTRACT.md", ""])).toEqual([]);
  });

  it("a contract inside a subfolder does not count", () => {
    expect(missingDocs(["src/a.ts", "CHANGELOG.md", "PROCESS.md", "docs/X_CONTRACT.md"])).toEqual(["*_CONTRACT.md for the round"]);
  });
});
