---
bump: minor
---
**Changed (development process)**
- **CI writes the version, release notes and generated documents** — each pull request adds its own change note in `docs/changes/` (bump type and text) instead of editing `package.json` and the top of RELEASE-NOTES.md; after the merge, the new job *Write release commit* sets the version, writes the entry (with the PR number), regenerates the SWBOM and the traceability matrix and pushes one release commit, which the run then builds, tags and publishes. Open pull requests no longer conflict on these files. A run on main is no longer cancelled by the next merge, so every version is tagged (CI-07, CI-09, CI-11; LIM-13 closed).

DF-128, SM-86; TC-CI-05, TC-CI-07.
