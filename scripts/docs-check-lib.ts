// Docs check (boss order 2026-11-23): a PR that changes code or user-facing text must update the docs that track the work.
// Pure function, called by scripts/docs-check.ts in CI.

const CODE = [/^src\//, /^drizzle\//, /^messages\//, /^public\//, /^next\.config\.ts$/];

const REQUIRED: { label: string; test: (f: string) => boolean }[] = [
  { label: "CHANGELOG.md", test: (f) => f === "CHANGELOG.md" },
  { label: "PROCESS.md (round status / next round)", test: (f) => f === "PROCESS.md" },
  { label: "*_CONTRACT.md for the round", test: (f) => /^[^/]+_CONTRACT\.md$/.test(f) },
];

export function missingDocs(changed: string[]): string[] {
  const files = changed.map((f) => f.trim().replace(/\\/g, "/")).filter(Boolean);
  if (!files.some((f) => CODE.some((re) => re.test(f)))) return [];
  return REQUIRED.filter((r) => !files.some(r.test)).map((r) => r.label);
}
