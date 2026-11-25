# AGENTS.md

This file is for AI tools other than Claude Code (for example Antigravity or Codex). The full team rules are in [CLAUDE.md](CLAUDE.md). **Read CLAUDE.md, [TEAM.md](TEAM.md) and [PROCESS.md](PROCESS.md) before you start**, then **[docs/HANDOFF.md](docs/HANDOFF.md)** (what is happening right now and what you may work on), the latest round's `*_CONTRACT.md` and the latest report in `docs/reports/`.

Communicate with the project owner (boss) in Thai.

## Non-negotiable rules (summary; CLAUDE.md wins on any conflict)

- **This repo may be public.** Never commit secrets (keys, tokens, passwords, connection strings, invite codes), real emails, names or phone numbers, dashboard URLs, provider account IDs, or details of unfixed vulnerabilities. Tests and examples use `@example.com` and made-up names.
- Never push to `main`, never force push, never merge PRs, never enable auto-merge. **Tools other than Claude Code do not push at all.** Work on a separate branch and leave it for the Lead (the main Claude Code session) to verify and open the PR.
- Commits use the noreply email already set in this repo (`git config user.email`). Never change it and never use `--author`.
- Do not touch the `Pre-start/` folder, and never commit `.env*` (except `.env.example`) or the untracked `assets/stickers/sprites/`.
- No feature code without a contract the boss has approved. Small non-feature work (bug fixes, UI polish, wording, docs) is fine — see the allowed list in docs/HANDOFF.md.
- Never disable tests or lower thresholds to make a gate pass.
- Do not create accounts or configure external services for the boss. Write the steps instead.

## Working next to Claude Code (same machine)

Claude Code agents may be working in the main folder at the same time. To avoid overwriting each other:

1. **Never work in the main project folder and never switch its branch.** Create your own folder from the latest `main`:
   ```
   git fetch origin
   git worktree add ../fatcatfit-ag-<topic> -b ag/<topic> origin/main
   ```
   Work only inside that folder. One branch per task, named `ag/<short-topic>`.
2. **Do not run the e2e suite (`npx playwright test`)** — it uses fixed ports (3110, 55425, 55432, 55433) that Claude Code's QA also uses. Unit tests are fine.
3. Commit in small pieces with a clear message (`fix: ...`, `ui: ...`, `docs: ...`). Do not push. When done, tell the boss the branch name; the Lead verifies it and opens the PR.
4. If a task turns out to need a forbidden area (see docs/HANDOFF.md), stop and say so instead of continuing.

## Gates to run before handing back work

```
npm run lint
npm run typecheck
npm test -- --reporter=dot
```

Write in your hand-back: what changed (files), why, gate results, and anything you could not verify.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
