# Instructions for coding agents (Codex and others)

This repository is worked on by more than one coding agent (Claude Code and Codex). **`CLAUDE.md` holds the working
rules and is the source of truth**: read it before any change and follow it as if it were written here. This file only
points to it and repeats what must never be missed. Where the two differ, `CLAUDE.md` wins.

## Every change

- **Documents in the same pull request as the code**, never as a follow-up: requirement rows, test cases and the
  coverage matrix, UAT plan, README, release notes with a **version bump** in `package.json`, and the Validation Package
  documents of the changed area. The full list is in `CLAUDE.md` → "Keep the documents current with every change".
- **Regenerate, never hand-edit**: `pnpm trace` (writes `docs/TRACEABILITY-MATRIX.md`) and `pnpm swbom` (the software
  bill of materials).
- **Checks before every push** — all must pass:

  ```
  npx tsc -b
  pnpm lint
  pnpm test
  node scripts/traceability.mjs --check
  pnpm -s build:web
  pnpm test:e2e   # after build:web, when the UI changed
  ```

## Constraints (never break these)

- PATs stay in browser / desktop local storage; never in Git, backups or SharePoint. One PAT per server.
- Writes go to dev.azure.com only; on-premises servers are read-only (web app and desktop proxy).
- The desktop updater downloads only from the fixed `desktop-latest` release and verifies SHA-256. Installers are built
  and published by CI only; do not tag or publish releases by hand.
- No confidential data, personal email addresses or secrets in the repository.

## Roles

`.claude/agents/*.md` describe seven roles (requirement gathering as the lead, settings, export, test protocol,
automation testing, DFMEA, security) and what each owns; `docs/DEVELOPMENT-PROCESS.md` §4 shows the order. An agent that
cannot run them as sub-agents reads them as checklists and does each role's part itself. Open questions go to the user
before the work starts, instead of assumptions.

## Working next to another agent

- **One agent per branch and pull request.** Do not change a branch another agent is working on.
- Expect merge conflicts in the files every change touches (`package.json` version, `docs/RELEASE-NOTES.md`,
  `docs/TRACEABILITY-MATRIX.md`, the software bill of materials): merge `main` in, keep both release-notes entries, give
  this change the next free version, and regenerate the matrix and bill of materials instead of merging them by hand.
- Requirement, test-case and risk IDs must stay unique: check the highest ID on `main` before adding one.
