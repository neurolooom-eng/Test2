# Release notes

Version history of the I&D Quality Demand Planning app, newest first. Every merged change bumps the version in `package.json` and adds its entry here, in the same pull request (CI-09; [CONFIGURATION-MANAGEMENT.md](CONFIGURATION-MANAGEMENT.md) §4): **major** for a change that breaks existing data, shared setup files or the way users work; **minor** for a new or changed feature; **patch** for a fix, a dependency update or documentation only. `pnpm test` fails when the newest version here is not the version in `package.json`. CI tags each version `vX.Y.Z` on its merge commit and publishes its GitHub release with the installers and this entry (CI-10); the build number of a version is the CI build of that merge (shown in the app under Force Update, and in `latest.json`). Open bugs and accepted limitations of every version are in [KNOWN-ISSUES.md](KNOWN-ISSUES.md); the third-party components of every version are in [SWBOM.md](SWBOM.md).

## v1.34.0 — 2026-11-06

**Added**
- **New Feature**: an optional **Your own User Story** (title, description), created under the new Feature in the Sprint chosen (BKL-25).
- **My Activities → Add a new activity → Feature**: **Add a User Story under it** — title, description and an optional comment, in the current Sprint (ACT-13).

**Changed**
- **My Activities layout**: KPI cards on top in the order Capacity, Planned hours, Actual hours, Tasks, with a small **% of capacity** badge on Planned and Actual (Actual also as % of plan); **Unsaved changes** only while you edit; **Your monthly update** with the progress ring and last day beside them; **Suggested missing items** below Your activities; columns **Epic, Activity, Planned, Actual** (ACT-02, ACT-05, ACT-11).
- **My Activities → Feature** is one drop-down you can type into to search (ID, title, Epic) (ACT-04).

**Fixed**
- **Fetch at start**: the Time Writing data was often not fetched when the app opened. The fetch now waits only for the connection setup from Git (at most 10 seconds) and shows in the top bar with its result or why it was skipped (FET-21; KB-38).

## v1.33.0 — 2026-11-06

**Added**
- **My Activities → KPI cards on top**: Tasks, Planned hours and Actual hours (the same figures as Monthly Time Writing for you), your Capacity (as on My dashboard), the Monthly update (% of activities updated, which replaces the ring) and Unsaved changes (ACT-11).
- **My Activities → Add a new activity → Feature**: create a Feature under an Active Epic — title, the mandatory Feature DoD and a description — assigned to you in the current PI, with your month Time Writing task and its hours when ticked; the Feature is then Active (ACT-12, ACT-10).

**Changed**
- **My Activities → Add a new activity**: the Feature list shows only **your** Features (assigned to you, or holding a story or task of yours), with a **search box** — type an ID, a title or an Epic to narrow it (ACT-04).

## v1.32.0 — 2026-11-06

**New**
- **My Activities**: the suggested missing items can be filtered by the Feature's state — **Active**, **New** or **Both** — and **Add all** moves the shown ones into Your activities (saved only with Save) (ACT-09).
- **Add a new activity**: the Feature can be chosen first — all Active and New Features are listed with their Epic, and choosing one fills in the Epic (ACT-04).
- Creating your month task under a Feature that is still **New** sets the Feature to **Active** in Azure DevOps (ACT-10).

**Fixed**
- **My Activities** (under Testing): Features without a task this month are no longer pre-selected in Your activities — they are only **suggestions** (with Epic and ID) in Your monthly update; **Add** puts one in your list, unticking returns it, and nothing is created until Save. This prevents saving tasks by accident (ACT-03, ACT-05; KB-37).

## v1.31.0 — 2026-11-06

**New**
- **Capacity vs Actual** (under Testing, Admin role only): capacity after leave and holidays against the hours booked — tiles for **capacity**, **actual**, **actual utilization** and **headroom / over capacity** against the month before; **12 months** of actual against capacity (bars in red when over); **by person** with % used and Over / On track / Under; **where the hours went** per Epic; Region, Epic and Owner filters (CVA-01…CVA-06).

## v1.30.0 — 2026-11-06

**New**
- **Planning Overview** (under Testing, Admin role only): the team's month on one page — Region, Epic and Owner filters; tiles for **planned utilization**, **delivery** (Features due this month done), **baseline exceptions** (more than 25% over) and **capacity risk**, against the month before where it applies; **workload and capacity** over 12 months (planned and actual hours against capacity, with a table view); an **exception queue** (over 25% baseline, missing baseline, capacity risk) linking to the items; **delivery health** per Epic for the next six months; and **Generate Monthly Pack** (OVW-01…OVW-08). Data completeness waits for its definition.

## v1.29.0 — 2026-11-06

**New**
- **Add a new activity** can add a **User Story** too: choose User Story, then the Epic and Feature, a title, a description and an optional comment; the story is created under the Feature, assigned to you, in the team's current Sprint, and the comment goes to its Discussion (ACT-08).

**Changed**
- **My Activities** (under Testing): two columns — your activities on the left, **Your monthly update** with **Add a new activity** below it on the right (ACT-02, ACT-07).
- **Add a new activity**: the fields are named **Epic** and **Feature**; only Features in state **Active** or **New** are offered; Epics and Features are listed with their ID, and the chosen ones open in Azure DevOps from their ID. The activities list shows each activity's ID as a link too (ACT-04).

## v1.28.1 — 2026-11-06

**Changed** (My Activities, under Testing)
- **Add a new activity** says what it adds: your month's Time Writing task under the Feature (in your Time Writing story there, created when you have none). Streams are the **Active** Epics only. When you already have the task, its current hours are shown and what you save replaces them — never added up, no second task (ACT-04).
- **Your recent updates** removed from Your monthly update: it ran outside its box (ACT-05).

## v1.28.0 — 2026-11-06

**New**
- **Testing** menu heading, for the Admin role only: pages being tried out before they replace others (ACT-01).
- **My Activities** (under Testing): a person's month on one page, in three cards — **Your activities** (month tasks with planned and actual hours; Features still without a task ticked to add; leave and training in a fold-out list), **Add a new activity** (stream, Feature, hours) and **Your monthly update** (progress ring, next last day to update, suggested missing items, recent updates). Same month-task rules as Bulk actions and Monthly Time Writing (ACT-02…ACT-07).

## v1.27.0 — 2026-11-06

**Changed**
- **Training versus leave**: under the Team Holidays and Training Epic a month Task is training (NPRA) when it or its User Story says "Training" — each person's "<Name> | Training | Time Writing" story — or carries a **Training** or **NPRA** tag; the Feature's title is no longer read, because leave and training share one Feature per person. A Training tag counts as NPRA anywhere (CAP-16, CAP-32; KB-35).
- **Historical hours**: an optional **Tag** column marks training / NPRA rows, so leave and training in the same Feature are told apart (HIS-16).
- **Bulk actions → Create month tasks**: the Leave list becomes **Leave and training** — your leave and training stories, each marked, unticked; training is no longer counted as missing work. A type you have no story for (PTO, Training, Sick Leave, Unplanned Leave) shows "Story + task missing" and creates **<Name> | <Type> | Time Writing** with the month's Task, like a Time Writing story (ATM-24, ATM-27).
- **Month locks**: Settings now says **Last day to update the plan / actuals** — the day entered is still open, the month locks from the next day (behaviour unchanged; MON-21, MON-23).

**Fixed**
- **Customize menu and View as** look tidy: full-width sidebar buttons, the menu listed by group with Pinned / In menu boxes, a stacked View as form, and the banner no longer repeats the role (MYD-07, CON-89; KB-36).

## v1.26.3 — 2026-11-06

**Security / dependencies** (daily check)
- `minimatch` 9.0.9 → 11.0.3 (override `minimatch@9`, used by electron-builder → @electron/universal): fixes the moderate advisory GHSA-g3hv-75wg-m249 (denial of service via globparts amplification). `pnpm audit` is clean.
- Updated within the current ranges: `joi` 18.3.1 → 18.3.2.
- Majors not taken: Electron 45, TypeScript 7, @types/node 26; Playwright stays pinned at 1.56.1.

## v1.26.2 — 2026-11-05

**Fixed**
- **Month locks**: every month now has its own planning and actuals lock dates — by default planning locks after the 5th of the month and actuals after the 4th of the next month (both days set in Settings → Capacity & periods → Period control), and any month can get dates of its own or be locked early, with a reason. The locks are kept with the capacity settings in **Git**, so every computer applies the same ones, and are worked out from the current time (checked every minute), so a new month starts open when the month rolls over. Before, locks were kept only in each browser, a month's actuals lock sat on the next month and the Monthly page checked the time only when opened (MON-06, MON-07, MON-21…MON-24, TC-MON-09, TC-MON-10, KB-34).

## v1.26.1 — 2026-11-05

**Fixed**
- **Historical hours**: changing the cut-off month on the import check now applies at once — moving it from October to November brings the October rows in without uploading again. Before, the later months were dropped while the file was read (HIS-15, TC-HIS-10, KB-33).

## v1.26.0 — 2026-11-05

**Added**
- **View as** (Admins only, sidebar footer → View as…): see the app as a chosen **person** — the menu and pages of their roles, their own My dashboard, Assigned to Me, Monthly Time Writing and personal views — or as a **role** alone. Read only: while it is on, nothing is saved to Azure DevOps or Git (refused before anything is sent); a banner names who you view as, with Change and Exit; it is never stored and a reload ends it (CON-89…CON-92, TC-ACC-04, TC-ACC-05, DF-51, SM-30).
- **Settings → Resources lists everyone**: besides the people with Time Writing Tasks, everyone else Assigned To fetched work, the people of the historical hours (leavers included), the Azure DevOps team members (**Add team members from Azure DevOps**, read only; the PAT needs Project and Team, Read) and people added by name — so region, role and dates can be set for all of them (CAP-29…CAP-31, TC-CAP-07, SM-31).

## v1.25.3 — 2026-11-05

**Fixed**
- **Historical hours**: Epic No and Feature No cells are read as Excel writes them ("37753.0", "#37753", several IDs — the first counts); any other text is listed with its row instead of being ignored, and each stream still needing an Epic says why (Feature No not in the fetched data, or neither column filled) (HIS-14, TC-HIS-09, KB-32).

## v1.25.2 — 2026-11-05

**Fixed**
- **Historical hours**: rows whose person is a group now apply to everyone in it, like a regional holiday Feature — **All** for everyone, **All-BLR**, **All-NL** and **All-US** for everyone in that region (Settings → Resources). Holidays under the Team Holidays and Training Epic count as public holidays, other group rows as reserved common time. Before, "All" rows were dropped and "All-BLR" counted as a person (HIS-13, TC-HIS-08, KB-31).
- **Historical hours** import check: rows left out by design (months from the cut-off on, months without hours) are counted apart from the **rows to check** (no person, no month, an unknown group), which are listed open (HIS-03).

## v1.25.1 — 2026-11-05

**Fixed**
- **Historical hours**: holiday rows of the workbook placed under a regional holiday Feature (by their Feature ID) now count for their own person only. Before, they were added up and the total given to everyone in the region, as a single Azure DevOps holiday booking is. Leave counts as absence and trainings as NPRA under the Team Holidays and Training Epic, as in Azure DevOps (HIS-12, TC-HIS-07, KB-30).

## v1.25.0 — 2026-11-05

**Added**
- **Historical hours** (Settings → Historical hours, roles with Manage shared settings): upload the team's planning workbook once and its **TransformedData** sheet brings the planned (Expected) and recorded (Actual) hours of the months before Time Writing in Azure DevOps into My dashboard, the Team overview, Pulse Check and the Monthly pack — people who have left included, by name. Before the cut-off month (default October 2026) only the history counts and the Azure DevOps Time Writing Tasks of those months are left out (they stay in Azure DevOps, the page shows how many); from the cut-off on, only Azure DevOps. The workbook is uploaded from your computer or read straight from the Git data repository (**From Git storage…**). A **Feature ID** column, when present, places the hours under that Azure DevOps Feature and its Epic (HIS-10, HIS-11). Names are matched to Azure DevOps names (checked and changeable before saving), streams without an Epic No are assigned an Epic, and every row not imported is listed with its reason. Kept in the Git data repository (`history-hours.json`), never in the app's source; nothing is written to Azure DevOps (HIS-01…HIS-11, UR-24, SR-28, UC-27, TC-HIS-01…06, DF-50, SM-29, KB-29).

## v1.24.2 — 2026-11-05

**Fixed**
- **S&S IT Supported releases**: a release now counts in every month in which one of its documents was signed (Last Modified), not only in the month of its newest document. The same applies to the month filter of every Windchill export page, the Quarter / Half-year / Year Pulse Check and the Monthly pack (CON-73, QV-33, KB-28).
- **Pulse Check over a Quarter, Half-year or Year** opens much faster the first time (it works out 24 months): DP and CP figures are read once per data set and picked per month (QV-51, KB-27).

## v1.24.1 — 2026-11-05

**Fixed**
- **Pulse Check** no longer freezes the app when opened: it never fetched, but it rebuilt the CP release tree and re-read the Windchill exports for every month shown on every open. The slow steps are now much faster, and the results are kept per data set and reused until the data changes (QV-51, TC-QV-32, KB-27, DF-49).

## v1.24.0 — 2026-11-05

**Added**
- **Expand all** / **Collapse all** above the sidebar menu: open or close every heading and both Release Details lists at once, remembered in this browser (NAV-37, TC-NAV-37).

**Changed**
- **Customize menu**: the **Pinned** box now sits on the left of each page name (MYD-07, TC-MYD-04).

## v1.23.0 — 2026-11-05

**Changed**
- **Team overview** replaces the Dashboard (Phase 3 of the insights plan): six headline tiles — Utilization, Overload and headroom, Plan accuracy, Plan health, Delivery, Forecast — each opening the tab that explains it; the 21 sections now sit in **Capacity and workload**, **Streams** and **Plan quality**, with a trail back. Same calculations; release counts per stream only on Pulse Check (MYD-10, MYD-11, TC-MYD-05; OV-11 updated, OV-13 retired).
- The tiles and the demand chart can be customized like My dashboard (MYD-06).

**Removed**
- The hidden **Insights workspace** and its code (MYD-12; WSP-01…07, SR-26, UR-22, DF-33 retired; LIM-09 closed).

## v1.22.0 — 2026-11-05

**Added**
- **Your own views** (Phase 2 of the insights plan): **Customize** on My dashboard shows, hides and reorders its sections; **Customize menu** pins pages to the top of the menu and hides others; the Dashboard and Pulse Check remember your period and filters. Kept in Git per person (`personal-views/<email>.json`) so they follow you to every computer; admins can save their layout as the default for everyone (MYD-06…MYD-09, TC-MYD-03, TC-MYD-04, DF-48, SM-28).

## v1.21.0 — 2026-11-05

**Added**
- **My dashboard** for everyone, the page the app opens on: your hours against your capacity, your open work and your streams and releases for the month, each count linking to its detail (MYD-01…MYD-04, TC-MYD-01).
- **Pulse Check periods**: Month, or a calendar Quarter, Half-year or Year compared with the period before — releases per stream (each once), change and work opened and closed (QV-50, TC-QV-31).

**Changed**
- **Team insights** access area: the Dashboard, Pulse Check, PI Review and the Insights workspace are shown by default only to Admin and People Manager; every role keeps My dashboard. Existing access files are updated the same way at the next start; change it per role in Settings → Access (MYD-05, TC-MYD-02, SM-27, DF-47).
- First step of the insights consolidation plan (Phase 1 of 3).

## v1.20.0 — 2026-11-05

**Changed**
- **No "v" before the release number** in the Feature titles the app builds (Create Feature on Release Details and the New Feature form): "DP | RSGMS | 3.0.0.2", CP "Care Pathways | 26.6". Features made earlier with "v" still match their release (BKL-24, TC-BKL-14).

**Added**
- **CP Platform releases**: a CP release container titled "PF1.0 <Name>-<Number>" or "PF2.0 <Name>-<Number>" is read straight from its title — the name with its variant ("PF2.0 Carpo") and the number after the last hyphen, letters allowed ("A12") (QV-49, TC-QV-30).

**Dependencies** (daily check 2026-11-05)
- `oxlint` 1.90.0 → 1.91.0 (build-time). Audit unchanged: one moderate advisory in the desktop packager (KB-16, no patched release).

## v1.19.3 — 2026-11-04

**Changed**
- Daily package update: `@vitejs/plugin-react` 6.1.2 → 6.2.1 (build-time; adds `semver` 7.8.6). No new advisories; the open one is unchanged (KB-16, minimatch in the desktop packager, no patched release).

## v1.19.2 — 2026-11-02

**Changed**
- Git history rewritten to remove work email addresses (KB-26): the addresses in old source files are now `name@company.com` and the commit author is ponkritz. Every commit ID changed; the files of every version are unchanged. Re-clone the repository. The version tags are re-pointed separately by the owner.

## v1.19.1 — 2026-11-02

**Security** (security scan: SM-26)
- Links of work items loaded from backups or Git are kept only when they are https (or empty), never `javascript:` or `data:` (KB-06, TC-STO-04).
- Rich-text fields (Description, Acceptance Criteria, …) are turned into text in one linear pass: a crafted 1 MB field no longer freezes the page (KB-03, TC-QV-12).
- The Excel reader refuses a sheet with cells beyond Excel's limits and caps cells and unpacked bytes, so a crafted upload cannot exhaust the tab (KB-04, TC-QEM-01).
- CI: the GitHub Actions are pinned to commit SHAs, and Dependabot opens weekly update pull requests (KB-08, R-07).
- Back up and clean up: a reset marker is applied once whatever its time, so a wrong clock cannot block a later clean-up (KB-25, TC-CON-56).
- Reported, not changed: two work email addresses in early commit history and one as a commit author (KB-26); the dependency advisory in the desktop packager is unchanged (KB-16); no Content-Security-Policy yet (R-08).

## v1.19.0 — 2026-11-02

**Added**
- **Back up and clean up the connections** (Settings → Storage → Shared setup in Git): download a backup of every connection and its query (no PATs), or back up and remove all of them — the backup is also saved to Git, the shared setup and the on-prem data in Git are emptied, and every other computer removes its old connections at its next start. PATs stay per server; the correct connections are then added again (CON-88, TC-CON-56, DF-46, SM-25).

**Changed**
- **New Feature: the Parent Epic starts blank** every time the form opens (QMS-0025, Assigned to Me, Create Feature on Release Details); choose the Epic from the list (BKL-23, TC-BKL-13).

## v1.18.1 — 2026-11-02

**Fixed**
- Settings → Azure DevOps → Stream mapping: **Edit**, **Set up** and **Add query** open the connection pop-up again. It was rendered only with the Other views section, so it showed there but not on Stream mapping (SET-14, KB-24, TC-SET-06).

## v1.18.0 — 2026-11-02

**Changed**
- More tables on the table design default (Columns, move by drag or ↑ ↓, Wrap text, Comfortable / Compact, one Export with Excel or CSV and real dates): Pulse Check's lists (Ongoing activities, Windchill exports, Supported Releases), the CP report, Baselines, Snapshots, Assigned to Me (its tree kept), Bulk actions' state checks, Monthly Time Writing (fields still editable) and Backlog Health (its own Columns dialog and Export CSV replaced) (UI-13, TC-UI-06).
- Summary tables stay plain, without the table toolbar: the Dashboard, Pulse Check's count tables, the capacity summaries, Insights, the Monthly pack KPI table and Documentation (UI-13).
- Still to come: the QMS-0025 backlog, Settings tables and QE Mapping (LIM-14).

## v1.17.0 — 2026-11-02

**Added**
- **One design default for tables** (Settings → Table defaults, shared, audited): every table built on it can resize columns, move them (drag a heading, or ↑ ↓ in the Columns list), show or hide columns, wrap text, switch Compact / Comfortable, and has **one Export** that offers Excel or CSV. Changing the default changes every such table (UI-07…UI-12, TC-UI-04).
- **Dates in exports are real date-times**: Excel gets dates it can show as a long date and time; CSV gets "yyyy-mm-dd hh:mm:ss" (UI-11, TC-UI-05).

**Changed**
- On the default now: every Release Details query output, the Azure release tables and the Windchill releases / projects, unique locations and raw data. Their old buttons (Export CSV, Export releases CSV, Export locations CSV, Columns, Reset widths) are replaced by the table's own controls. The other tables follow in the next versions (LIM-14).

## v1.16.1 — 2026-11-02

**Changed**
- Release Details pages take less room at the top: Refresh from Azure / Windchill and Import newer export are small icon buttons (↻, ⤒; hover for the name), and Load from Git, Connection settings and Remove are in a ⋯ menu (QV-48, TC-QV-28).

## v1.16.0 — 2026-11-02

**Added**
- **QE Mapping → ＋ Add row** opens a pop-up with a field per column; **Save** adds the row and saves the QE Mapping to Git straight away. The **QE Name** is chosen from the Resources list (Settings → Resources), in the pop-up and when editing a QE Name cell (QEM-12, TC-QEM-09).

**Changed**
- **Release Details pages show the consolidation and the raw data as two tabs** instead of the raw rows at the bottom: DP, CP, IOCC, Content and Tool Validations (Releases / CP report | Query output) and every Windchill export (Releases / Projects | Raw data) (QV-47, TC-QV-27).

## v1.15.0 — 2026-11-02

**Added**
- **Several ECP exports, each with its own setup:** the Windchill import has a **Logic** dropdown (Standard / ECP setup); for ECP, **Project details at** chooses the Location folder holding "Project number Project name" (2nd, 3rd… — type 1 is the 2nd), then you name the export (e.g. "ECP - Type 1"). Each ECP export has its own menu entry (with "＋ ECP export" to add another) and its own line in Pulse Check and the Monthly pack; the logic and folder are saved with the export and can be changed on its page (CON-87, TC-CON-55, DF-44).

## v1.14.1 — 2026-11-02

**Changed**
- ECP's release table and its CSV name the columns **Project No** and **Project Name** instead of Release and Release name (CON-86, TC-CON-54).

## v1.14.0 — 2026-11-02

**Changed**
- **QRE is renamed ECP** (menu, Pulse Check, Monthly pack, Create Feature "ECP | …"); an export imported earlier as "QRE" shows as ECP (CON-83, CON-85).
- ECP reads a Location as "Parent folder/Project number Project name/Phase/…": the release is the **second folder**, shown as "<number> <name>" (e.g. "123456 Patient Monitor"), with every document under it; a leading "/" does not count, and a number that is not "PJ-…" is kept as written, never "v<number>" (CON-83, TC-CON-51).

## v1.13.1 — 2026-11-02

**Fixed**
- The QRE export did not reach the QRE page when its file was not called "QRE…": "＋ QRE" (and "＋ S&S IT") now import the file named after the stream, so it becomes that stream's page, Pulse Check and Monthly pack source (CON-85, TC-CON-53, KB-23).

## v1.13.0 — 2026-11-02

**Changed**
- **QRE**: a release is now the Location folder at index 2 whatever its name, and every document anywhere under it counts to it; a "PJ-<number> <name>" folder is still split into number and name. Folders deeper down are no longer read as projects of their own (CON-83, TC-CON-51).

## v1.12.1 — 2026-11-02

**Fixed**
- Leave in Bulk actions still showed "Choose story" when your leave Feature holds one story of yours per leave type (PTO, Sick Leave, Unplanned Leave): each open story of yours is now its own Leave row ("Your name › PTO"), and ticking it creates that month's Task under that story, never duplicated (ATM-26, TC-ATM-18, KB-22).

## v1.12.0 — 2026-11-02

**Added**
- **QRE** joins the default streams under Release Details → Windchill exports: each release is a project "PJ-<number> <name>" read from the Location path at index 2, otherwise read like S&S IT (month, Pulse Check, Monthly pack, QMS-0025 match, Create Feature "QRE | PJ-1234 Name") (CON-83, TC-CON-51).
- **BRITE** has a place at the root of Release Details, not set up yet (CON-84, TC-CON-52).

**Fixed**
- Leave in Bulk actions showed "Choose story" on a shared leave Feature where everyone keeps a story of the same title: your month Task now goes under your own story there (any title), else a new one of yours — never under a colleague's (ATM-25, TC-ATM-17, KB-21).

## v1.11.0 — 2026-11-02

**Added**
- Bulk actions lists your leave Features (PTO, Sick Leave, Unplanned Leave) in a separate **Leave** list, unticked and never counted as missing; tick the leave you take that month (ATM-24, TC-ATM-16).
- **＋ Time Writing Task** on every Feature and User Story row of the QMS-0025 backlog and of Assigned to Me adds this month's Task for you under that Feature, by the Bulk actions rules (BKL-22, TC-BKL-12).

**Changed**
- The QMS-0025 backlog opens filtered to you (Assigned to me ✕), with the items above and below yours; clear it to see everyone's until the next start (BKL-21, TC-BKL-12).

## v1.10.0 — 2026-11-02

**Changed**
- The Absence Epic is now **Team Holidays and Training** (same ID). Training under it — a Task, Story or Feature titled with "Training", such as each person's *Training - Time Writing* story — counts as NPRA, not absence; PTO, Sick Leave, Unplanned Leave and the common holidays stay absence. Bulk actions and Assigned to Me offer the month Task for your own Training story. Settings names the Epic accordingly (CAP-16, TC-CAP-06).

## v1.9.0 — 2026-11-02

**Fixed**
- The work email was lost after an app update (Force Update): the app read it from the first saved connection instead of the Time Writing one and then saved the empty value back (KB-20).

**Changed**
- Your work email is now a setting of its own: Settings → Azure DevOps → **Your work email**, the first section. It is not part of the Time Writing connection or the stream mapping, and updates, Git syncs and connection edits do not change it; the Time Writing connection form no longer asks for it. On the first start the email already on your Time Writing connection is taken over (CON-82, TC-CON-50; DFMEA DF-43; SECURITY-ASSESSMENT SM-22).

## v1.8.0 — 2026-11-02

**Changed**
- Time Writing prompts in Bulk actions and Assigned to Me now cover every Feature where you have a User Story in your name — in any state but Removed, your own Time Writing story included — as well as the Features assigned to you; before, only open stories that were not Time Writing stories counted, so Features shared with a colleague could be missed. On a shared Feature, each person's month Task goes under their own Time Writing story, never under the other person's (ATM-23, TC-ATM-15).

## v1.7.0 — 2026-11-02

**Changed**
- Settings is now its own menu group with one page per area (Azure DevOps, Storage, Access, Feature setup, and for shared roles Capacity & periods, Resources, Master data, Monthly pack, Audit) instead of tabs on one page; the header names the page. Long pages are split into sections shown one at a time — Azure DevOps: Servers and PATs, Stream mapping, Other views, Read-only sources, Synthetic sample; Storage: Git storage, Load from Git, Shared setup in Git, SharePoint; Capacity & periods: Capacity and absence, Holidays and common activities, Period control. The last page and section are remembered, and Get started and the menu's ＋ entries open the section they are about (SET-14, NAV-17, TC-SET-06; NAV-04 retired).

## v1.6.0 — 2026-11-02

**Added**
- Successor and Predecessor IDs: work items read from Azure DevOps keep the IDs of their Successor and Predecessor links (Dependency link type). A view of its own — a connection that is not a stream or a stream's data set, such as an on-prem release query — shows them as **Successor ID** and **Predecessor ID** columns, sortable, searchable and in the CSV. Stream views are unchanged (CON-81, TC-CON-49).

## v1.5.1 — 2026-11-02

**Fixed**
- New users got the admin's work email pre-filled on their Time Writing connection, and with it the admin's access role and "my" work (KB-19). The work email is now personal: it is never written to the shared connection setup in Git, an email in an older file is ignored, a sync keeps the email entered on the computer, and an email inherited from the file is cleared once so each user enters their own (CON-80, TC-CON-48; DFMEA DF-43; SECURITY-ASSESSMENT SM-22).

## v1.5.0 — 2026-11-02

**Added**
- Create Feature on every stream: the IOCC, Content and Tool Validations release tables now end with the same **QMS-0025 match** column as DP, CP and S&S IT — the matched Feature / User Story, else the closest item and **Create Feature** on every release without a Feature, titled "{stream} | {release name} | v{release}" (QV-46, TC-QV-26). Before, these streams offered it only on releases that were not tracked or matched below the threshold.

**Changed**
- The Time Writing Feature column of those tables keeps its match and hours but no longer has its own Create Feature button (one per release, in the new column).

## v1.4.2 — 2026-11-02

**Changed**
- Daily package update: Electron 44.10.0 → 44.10.1 (desktop runtime, patch release); tslib no longer needed in the lockfile. SWBOM regenerated (CI-08).

**Security**
- `pnpm audit`: 1 moderate finding before and after — GHSA-g3hv-75wg-m249 in the build-time minimatch 3.x, 5.x and 9.x copies of electron-builder, which have no patched release in their lines (accepted, KB-16); not shipped. Secret scan of tracked files and history: clean.

## v1.4.1 — 2026-11-01

**Changed**
- Pulse Check: the DP **Supported Releases** list under the release quadrants is folded by default, showing only its title and count; **Show list** opens it when needed and the app remembers the choice per viewer (QV-32, TC-QV-17).

## v1.4.0 — 2026-11-01

**Added**
- Automatic tagging: every merge to main that passes the Windows, macOS and end-to-end builds is tagged `vX.Y.Z` by CI and gets its own GitHub release with both installers, their checksums and its entry from these release notes; nobody tags by hand (CI-10, `scripts/release-entry.mjs`).

**Changed**
- CONFIGURATION-MANAGEMENT.md §2, §4, §5 and §7, README and CLAUDE.md: tagging is done by CI, not after the merge by hand.

**Known issues**
- v1.3.0 (commit `503232d`) has no tag: it was merged before tagging was automatic, and the tag could not be pushed from the development session (LIM-13).

## v1.3.0 — 2026-11-01

**Added**
- Release notes with a version history, and a configuration management plan ([CONFIGURATION-MANAGEMENT.md](CONFIGURATION-MANAGEMENT.md)); every merged change now bumps the version and adds its entry here (CI-09).
- The stream mapping set by an admin in the shared setup in Git (DP, CP, IOCC, Content, Tool Validations and DP's data sets) is enforced for every user at their next start; an admin's change is saved to Git on every Save or Set up, with **Save stream mapping to Git** to write it again (CON-79, #178).

**Changed**
- DEVELOPMENT-PROCESS.md §8 (configuration management) now points to the configuration management plan; CLAUDE.md asks for the version bump and the release-notes entry in every pull request.

## Before v1.3.0 — 17 October to 1 November 2026

Versions 1.0.0 (17 October 2026) to 1.2.2 were released without individual notes; their changes are in the Git history and the merged pull requests up to #177. The main features of that period:

- **Planning and time writing:** Monthly Time Writing with planning and actuals locks, ad-hoc tagging after the planning lock, Assigned to Me, Bulk actions (month Tasks up to the Target date, move to the current Sprint, state checks), shared-activity month Tasks, New Feature / New User Story / Edit work item forms with Discussion, background jobs.
- **Capacity and insights:** capacity model with joining and leaving dates, Dashboard, Pulse Check, Monthly pack (.pptx in the team template), Backlog Health.
- **Release details:** DP from its own query with DDT month counts and the QMS-0025 match; IOCC, Tool Validations and Windchill (S&S IT) release counting; CP release reporting from QA/QE signatures in the release-folder tree query; tree and direct-links queries; Create Feature from every release view.
- **Settings and sharing:** servers with one PAT each, stream mapping, access roles, Feature setup per Epic, shared setup in Git, QE Mapping.
- **Validation Package:** three-level requirements, generated traceability matrix, test, UAT and verification plans, DFMEA, security assessment, known issues, software components and SWBOM, development process, E2E suite, daily dependency and secret check.
