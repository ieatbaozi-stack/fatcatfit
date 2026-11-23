# AGENTS.md

This file is for AI tools other than Claude Code (for example Antigravity or Codex). The full team rules are in [CLAUDE.md](CLAUDE.md). **Read CLAUDE.md, [TEAM.md](TEAM.md) and [PROCESS.md](PROCESS.md) before you start**, then the latest round's `*_CONTRACT.md` and the latest report in `docs/reports/`.

Communicate with the project owner (boss) in Thai.

## Non-negotiable rules (summary; CLAUDE.md wins on any conflict)

- **This repo may be public.** Never commit secrets (keys, tokens, passwords, connection strings, invite codes), real emails, names or phone numbers, dashboard URLs, provider account IDs, or details of unfixed vulnerabilities. Tests and examples use `@example.com` and made-up names.
- Never push to `main`, never force push, never merge PRs, never enable auto-merge. **Tools other than Claude Code do not push at all.** Work on a separate branch and leave it for the Lead (the main Claude Code session) to verify and open the PR.
- Commits use the noreply email already set in this repo (`git config user.email`). Never change it and never use `--author`.
- Do not touch the `Pre-start/` folder, and never commit `.env*` (except `.env.example`).
- No feature code without a contract the boss has approved. Small non-feature work (docs, typos, answering questions) is fine.
- Never disable tests or lower thresholds to make a gate pass.
- Do not create accounts or configure external services for the boss. Write the steps instead.

## Good fits for other tools

Small, non-feature work: fixing wording, editing docs, exploring and explaining code. Features that touch accounts, sign-in or health data go through the team in Claude Code, which has independent reviewers (`qa-test`, `security-privacy`).

## Gates to run before handing back work

```
npm run lint
npm run typecheck
npm test
```
