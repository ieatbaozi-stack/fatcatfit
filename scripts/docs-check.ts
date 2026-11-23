// Usage: npx tsx scripts/docs-check.ts <base-ref>   (CI passes the PR base SHA)
import { execFileSync } from "node:child_process";
import { missingDocs } from "./docs-check-lib";

const base = process.argv[2];
if (!base) {
  console.error("usage: docs-check.ts <base-ref>");
  process.exit(2);
}
const out = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" });
const missing = missingDocs(out.split("\n"));
if (missing.length) {
  console.error("This PR changes code but does not update:");
  for (const m of missing) console.error(`  - ${m}`);
  console.error("Update them (see CLAUDE.md: docs must stay current), then push again.");
  process.exit(1);
}
console.log("docs check: ok");
