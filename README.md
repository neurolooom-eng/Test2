# Demand Planning Hub

Windows desktop MVP for demand planning, effort tracking, capacity, release milestones, governance and monthly reporting.

## Current baseline

The repository contains a working React/TypeScript application with an Electron desktop shell. It starts with synthetic local data and includes an opt-in Microsoft sign-in adapter for centrally stored SharePoint data.

Implemented in the MVP UI:

- Separate Board view for the parent/child tree, state filters and release Feature/Story/Task creation; Azure DevOps handles connection settings, saved PAT and data fetch ([setup](docs/azure-devops-connection.md)).
- Capacity Overview from Azure Time Writing Tasks: who is overloaded or has capacity, hours per stream (Epic), person × stream matrix, absence split into PTO / Sick Leave / Unplanned Leave / regional public holidays under a configurable absence Epic
- Uniform page layout with a shared Azure source bar, light/dark themes, and a local-time clock with data-freshness labels
- Read-only release source: a second Azure project queried with a saved WIQL query, releases listed per stream from the Area Path and cross-checked against Time Writing items

- Unified dashboard for plan, actuals, variance, ad-hoc work, utilization and milestones
- Activity register with process owners, resources, bands and measurable complexity
- Monthly planning and actuals; automatic month-level ad-hoc classification after planning freeze
- Independent planning/actuals locks, extensions, reason and audit trail
- Versioned, editable effort baselines and non-blocking ±25% variance flags
- TFS/Windchill/manual release staging model
- Direct `.xlsx` TransformedData-sheet loading plus CSV template, header-driven validation and idempotent import
- Automatic creation of previously unknown team members as Contributors during migration
- LTE/PI Review snapshots plus CSV/JSON export
- Owner, Admin, Process Owner, Contributor and Viewer role model
- Resource list read from Azure (Assigned To), with region, role and reporting line kept in the shared app data; admin-controlled master data
- SharePoint connection, initialization, pull, autosave and edit-conflict detection

## Run

Requires Node.js and pnpm.

```powershell
pnpm install
pnpm dev
```

Desktop development:

```powershell
pnpm dev:desktop
```

Validation and Windows installer:

```powershell
pnpm lint
pnpm build:web
pnpm build
```

## GitHub Actions deployment

### Versions, build identity and Force Update

The current release is **v1.2.2**. The authoritative number is `package.json` (`1.2.2` without the display prefix); the UI and release tags use **vX.Y.Z**. Increase **X** for a major/incompatible change (reset Y and Z), **Y** for a new backward-compatible feature (reset Z), and **Z** for bug fixes only. Rebuilding an unchanged release keeps its version and gets a distinct build ID. Do not automatically treat every commit as a release or infer version changes from build counts. Future releases must bump the appropriate component before deployment.

The sidebar shows version, build ID and build date/time in **IST**; the Force Update dialog also shows the source commit. GitHub Actions stamps the build ID as `GITHUB_RUN_ID.GITHUB_RUN_ATTEMPT` and the build number as `GITHUB_RUN_NUMBER`; local builds use a commit/timestamp ID and the commit count. The version stays fixed between releases; the build number is the internal reference for which deployment is running. Metadata is embedded in the app, emitted to `build-info.json`, and stamped into HTML. Both CI jobs verify the version and reject a release tag that does not exactly match `v` plus the package version.

**Force Update** checks a cache-busted, `no-store` build manifest, retrieves fresh same-origin HTML, verifies that its build ID matches the manifest, then navigates using unique update query parameters. Hashed assets include the build metadata and therefore change with each build. An offline/error response or an older HTML response blocks navigation and allows retry. This is a supported best-effort web equivalent of Ctrl+Shift+R; web JavaScript cannot invoke the browser's privileged hard-reload command. The button never clears localStorage, IndexedDB, cookies, PATs or column preferences. Browser/proxy caching policies still apply.

Updates always require acknowledgment of unfinished forms. Pending saves and active Azure fetches block reload. A failed save, SharePoint conflict or unsaved fetched preview requires exporting JSON first; the update backup includes the current preview and its scope. Export does not capture text in unsubmitted forms, so save or cancel those first. Desktop **Force Update** uses a trusted, narrow Electron cache-ignoring reload and reloads the installed package only—it does not download/install a new executable. The web button is also available on the startup/recovery screen, where it never exports an unread dataset as if it had been loaded.

Every push or pull request to `main` runs static analysis, compiles the production web bundle, packages the Windows NSIS installer, calculates its SHA-256 checksum and publishes the result as a 30-day workflow artifact.

Pushing a version tag such as `v0.1.0` runs the same verified pipeline and deploys the installer, blockmap and checksum to a GitHub Release. The workflow uses the repository-scoped `GITHUB_TOKEN`; no personal access token or application secret is required.

Every push to `main` also builds and deploys the browser version to GitHub Pages at `https://ponkritz.github.io/DemandPlanning/`. It uses local browser storage until an Admin configures the approved Entra SPA registration under **Administration → SharePoint connection**.

## Data and security boundary

### Azure dashboard mapping (v1.0.0)

Overview and its deterministic insights consume the exact same scoped `azure.items` workspace as Backlogs: a fresh selected-team preview takes precedence over the verified saved cache. Removed records are excluded. Visual state filters on Backlogs do not change dashboard totals. Refresh is explicit; failed refreshes retain the previous dataset and display the error. There is no local planning/demo fallback.

The selected month Task is the authoritative source: `Microsoft.VSTS.Scheduling.OriginalEstimate` and `Microsoft.VSTS.Scheduling.CompletedWork` are read directly from a Task named, for example, `October 2026 | Feature title`. Its parent Time Writing User Story (also accepts the historical `Time Writting` spelling) provides context only. Missing Task fields remain unavailable; zero remains zero; populated-field counts are displayed. Variance uses only Tasks with both fields. The >25% alert compares Completed Work to a positive Original Estimate, not a separately approved baseline. **Monthly Time Writing** stages edits across multiple Tasks and saves them in one controlled action. Each changed Task is verified to have a Time Writing User Story parent, then Azure confirms the exact saved field(s); the action requires the active ADS configuration PAT to have Work Items (Read & Write). It cannot edit Features, arbitrary fields or another project.

The six-month table uses Original Estimate and Completed Work only on direct child Tasks under those Time Writing stories, assigned to months by the agreed `October 2026 | Feature title` naming convention. The dashboard and Monthly Time Writing view group these selected stories by traversing Story → Feature → Epic parent links. Items without a resolved Epic appear as `No Epic path`. Undated/unmatched tasks are counted as unmapped, not attributed by Created/Changed Date. Work-field units must be confirmed in the Azure project; Story Points are never treated as hours. Snapshot/revision history is not available, so estimates are not claimed to be frozen monthly plans or time entries.

NPRA Hours remain a separately tracked Feature category (exact tag `NPRA Hours`) and do not adjust utilization. Weekdays only are counted as working days (Monday–Friday). Regional public holidays come only from the absence Epic (see below); partial availability and leave booked outside the absence Epic are not inferred.

### Capacity, absence and utilization

The Overview is built from a capacity model (`src/capacity.ts`) over the same selected-month Time Writing Tasks. Funded hours per person are `working days × hours per day` (default 8). **Absence** is the Completed Work on month Tasks whose Epic is the configured **absence Epic** (default `#37778`); each person's Feature under that Epic, and the Task title, decide whether the hours are **PTO**, **Sick Leave** or **Unplanned Leave** (anything else is "Other absence"). Available hours = funded − absence. **Utilization = booked hours ÷ available × 100**, where booked hours are the Completed Work on all other month Tasks assigned to the person. A person is **Overloaded** at or above the overloaded threshold (default 100 %) and **Has capacity** below the capacity threshold (default 80 %); in between is Balanced; a person with absence only is "No bookings". Streams are the Epics reached by walking Task → Story → Feature → Epic; the person × stream matrix shows booked hours per Epic. The absence Epic ID, hours per day and both thresholds are edited under **Administration → Capacity and absence** and stored with the shared app data (IndexedDB/SharePoint), not per browser; every change is audited. An empty or zero denominator displays unavailable rather than an infinite percentage.

**Release baselines.** The **Baselines** page calculates each release's baseline from **estimation rules** per stream (`src/baseline.ts`): fixed hours by release type (e.g. DP Major 40h, MLD 30h, PU 20h), plus line items priced per unit where *units = base units + driver count × units per driver* (e.g. CP documents: `2h × (14 + 11 × assets)`), with an optional maximum per release (e.g. Serviceability 60h). Releases are the Features under a stream Epic that has a rule. Each release's scope (type and driver counts such as documents or assets) is kept as a dated history: re-baselining after items are scoped in adds a version, so the page shows the first baseline, the current one, the scope growth between them and the actual Completed Work booked on the release's Time Writing Tasks. The rule values shipped are illustrative examples to be replaced with the exact baseline. Rules, scopes and the resource mapping are saved to Git (below).

**Azure connections.** The Azure DevOps page holds any number of connection sets, each with a name, what it is used for, base URL (`https://dev.azure.com/<organization>`), project, PAT and an optional flat WIQL query (only its WHERE clause is used; results are paged by ID). Uses: **Time Writing** (read & write; without a query the team's Epic backlog is read, with a query its results plus their missing parents up to the Epic; one Time Writing connection is active and previews before saving), **Releases · DHFI** (read only; default: approved documents), **Documents · Vault** and **Reference** (read only; default: all non-removed items in the project; stored as snapshots with the app data). **Fetch all** reads the active Time Writing connection and every read-only connection one after another; nothing is written to Azure when fetching. PATs stay in the browser. Only Azure DevOps Services (`dev.azure.com`) addresses are accepted.

**Git storage for planning data.** Baseline rules, release scopes and the region / role / reporting-line mapping are kept in one JSON file (`planning-data.json` by default) in a **separate private GitHub repository**, configured under **Administration → Git storage** (owner, repository, branch, file path and a fine-grained token limited to that repository with *Contents: Read and write*). The token stays in the browser like the Azure PAT and is never written to app data, exports or audits. The file is loaded when the app starts; edits show as *Unsaved changes* on the Baselines and Administration pages until **Save to Git** commits them with a message, so the repository history records who changed which baseline and when. Saving sends the version that was loaded and is refused if the file changed in the meantime (load the latest and re-apply). Saving is disabled while the synthetic sample is loaded. Regional holidays stay in Azure under the absence Epic. Keep the app repository free of planning data: if it is public, so is its GitHub Pages site.

**Regions, roles and regional holidays.** People are read from Azure (Assigned To on Time Writing Tasks); under **Administration → Resources** each person gets a region (India, Netherlands, US), a role (QE, QMS, CAPA, Lead, Manager), an optional people-manager flag and a "reports to" line, shown as a reporting tree. Profiles are keyed by the Azure display name and stored with the shared app data. Regional holidays live in Azure under the absence Epic: a Feature whose title names holidays and a region (for example `Public Holidays - India`; `NL`/`Netherlands`, `US`/`USA` are recognised), with a `… - Time Writing` story and `<Month YYYY> | <Holiday>` Tasks. Each Task's hours (Completed Work, else Original Estimate, else one working day) are added as **Public holiday** absence to every person mapped to that region who has bookings in the month, instead of to the Task's assignee. People without a region are listed as not receiving regional holidays.

### Read-only release source and connection roles

Each ADS configuration now carries a **role**: *Time tracking (Read & Write)* — the active configuration used for Fetch preview, Refresh, Feature creation and Monthly Time Writing — or *Release source (Read only)*, which never writes. Both can be active at once. Under **Azure DevOps → Release source**, select the read-only configuration (for example the DHFI project) and paste its saved work-item query; only the query's WHERE clause is used, wrapped as `SELECT [System.Id] FROM WorkItems WHERE (…) AND [System.Id] > n ORDER BY [System.Id]` so results page safely and the Electron proxy's read-only guard still applies (tree, link and ASOF queries are rejected). Fetched documents are stored with the shared app data (`releaseSource`) and audited. **Feature milestones → Approved releases by stream** reads the release identifier from each document's Area Path (last segment below the project; optionally a capture pattern in `releaseSourceSettings.releasePattern`) and the stream from the segment above it (`releaseSourceSettings.streamSegment`, default 1), lists `Stream (n): Rel1, Rel2, …`, counts approved documents per release, and flags releases that no Feature, User Story or Task title in the time-tracking backlog mentions. The stream rule is provisional until the stream definitions are confirmed.

### Shared layout, themes and clock

Every page uses the same scaffolding: the header shows the page title and purpose from one registry (`src/pages/registry.ts`, which also drives the grouped sidebar), followed by the **Azure source bar** on every page that reads the backlog (scope, item count, freshness, Refresh, preview save/discard, scope warnings, errors and messages), metric tiles, and table panels with a consistent empty state. The app ships a **light and a dark theme**: it follows the operating system by default and the header toggle pins Auto → Light → Dark per browser; `?theme=light` or `?theme=dark` in the URL opens the app in that theme and remembers it. The header **clock** runs from the system clock in the viewer's own time zone, and all freshness labels ("Refreshed 5 min ago", build time) are relative to it, with the absolute local time on hover; the Force Update dialog still shows the build date in IST.

### Monthly locking and ad-hoc Tasks

Planning defaults to locking at the end of the 5th of the selected month. Actuals for a month default to locking at the end of the 5th of the following month, so Planning for the current month and Actuals for the previous month close on the same date. Administration can explicitly lock either control or extend it independently with a documented reason. When planning is closed, Original Estimate is not editable. A month Task that first receives Completed Work after planning closes is tagged `ad-hoc`; its Original Estimate remains unavailable for edit while Completed Work remains editable until Actuals close. These controls are enforced by the app UI and Azure write request; Azure DevOps administrators should retain their normal project-level permissions as the final source-side control.

Feature closure counts require a completed state (Closed, Done or Completed) and Closed Date, bucketed in India time. Target Date determines overdue non-completed items. Feature completion is not proof of release/milestone sign-off. YoY counts describe only currently fetched backlog membership; historical coverage is not guaranteed and a zero denominator never produces a fabricated percentage. Resource totals use Assigned To on Time Writing stories, not local synthetic people. Bands and lessons remain unavailable pending explicit source mappings. No 160-hour capacity is assumed. The UI provides source-item links and a field-mapping table. No external AI integration is enabled.

Refresh Azure once after updating to populate new scheduling fields in older saved caches. Run `pnpm test:azure` for source mapping, missing/zero values, hierarchy exclusion, monthly attribution and India date-boundary tests. Live tenant field availability must still be verified with an authenticated refresh.

### SharePoint snapshots (v0.3.0)

New LTE/PI Review snapshots are separate JSON files saved directly to the connected site's default document library, in a `Snapshots` folder beside the configured central state file. With the existing default path this is `Demand Planning MVP/Snapshots`. Snapshots do not update the central state file or append a full payload to IndexedDB. The shared history is loaded from SharePoint (with pagination), with links to the files. Legacy app snapshot records remain untouched and are labelled unverified; they are not automatically uploaded.

Configure **Administration → SharePoint connection** and complete Microsoft sign-in first. An approved Entra SPA Client ID, permitted Graph delegated access and site/library write access are required; an Azure DevOps PAT cannot authorize this. Connection can save snapshots even before the central app-state file has been initialized. The browser dataset/cache remains separate and continues to use IndexedDB.

Each snapshot freezes the currently loaded app dataset, selected month/type, signed-in author, UTC creation time and build identity. It includes saved Azure work items, not an unsaved Azure fetch preview; refresh/save source data first. Earlier snapshot payloads and authentication settings are excluded. A unique file name avoids normal multi-user collisions, and upload requests specify conflict failure. Success is reported only after uploading and comparing a read-back with the frozen JSON. Failed/disconnected writes never silently save a browser snapshot. If upload verification is uncertain, refresh history before retrying to avoid duplicate captures. Files are capped at 200 MB. Existing SharePoint access, versioning and retention settings apply; no immutable-record or validated-compliance claim is made.

Before acceptance, test an actual authenticated upload in the Philips tenant, cross-user history visibility, denied write access and network failure. Automated transport tests do not substitute for these checks. Snapshot JSON is not a rendered PPT/PDF report or a normal restore-backup file.

### Backlogs, columns, refresh and current iterations

The Azure fetch is strictly **the selected team's native Epic backlog**, not all items in a project or area. The default source is the supplied InD Quality Epic-backlog URL. The team embedded in a backlog URL takes precedence over the manual team field. The app reads `/{team}/_apis/work/backlogs/Microsoft.EpicCategory/workItems` for Epic membership, then follows direct parent IDs through descendants using the team's exact/child-area rules and excluding Removed items. Every child query has a parent-ID constraint. An inaccessible or empty backlog never falls back to a project-wide query. Unrelated items in the same area are not fetched. The all-project Epic option has been removed.

Fetched membership is stored with organization/project/team and exact item keys. Older unscoped caches are hidden until a verified refresh. Saving a scoped preview **replaces the Azure cache** rather than merging old out-of-scope records back in; zero-item results can also be saved. Export JSON first if the previous cache is needed. This removes only cached copies, not Azure source work items, activities, effort records or other app data. A failed fetch leaves the old saved data intact. Failure to remember the PAT in small browser settings no longer aborts an otherwise valid in-memory-token fetch.

### Azure PAT profiles

Connection settings can store several named ADS configurations. Each configuration is one complete set: **Azure DevOps URL, PAT and reason**—for example **Quality Backlog Read** or **Release Work Item Write**. Select exactly one active configuration; Fetch preview and Refresh use that configuration’s URL and PAT together, while the reason is the visible audit label. Saving a preview replaces the cached Azure dataset with that selected source scope, so dashboards never silently mix different source scopes. Configurations are browser-local only and excluded from IndexedDB app data, JSON backups, SharePoint snapshots, browser exports and GitHub. Use separate least-privilege tokens where possible: a read-only configuration for refresh and a Work Items (Read & Write) configuration only while creating or updating work items. Removing a configuration only removes its local copy; revoke the PAT in Azure DevOps if it should no longer work. Browser-local storage is not an enterprise secret vault, so do not share a browser profile with someone who must not use the token.

**Backlogs** (formerly Board) is a compact, expandable table following Epic → Feature → User Story → Task parent links. It defaults to the multi-select **New + Active** state filter. Select additional source states or **All**. Removed items are always excluded, including parent context, level selectors and the source-details table; active descendants remain visible with a missing-parent indicator. Other ancestors outside the state filter are shown as parent context. **Refresh from Azure** reads a fresh snapshot without changing Azure DevOps; **Save fetched work items** persists that snapshot in app storage. Failed refreshes retain the previous data. This is an on-demand refresh, not a background/live subscription.

**Column Options** supports visibility, ordering, reset, cancel and apply. Title is required to retain hierarchy controls. Preferences are saved separately in the browser per organization/project/team and do not modify Azure DevOps or central app state. Default columns: Order, ID, Work Item Type, Title, Description, State, Story Points and Actions. Additional columns: Assigned To, Iteration Path, Area Path, Target Date, Closed Date and Tags. Description is displayed as plain text, never injected HTML. Refresh old snapshots once to populate the newly mapped Description and Story Points fields. Empty numeric values are not replaced with invented estimates. The table has a sticky header, horizontal scrolling and 200-row pagination of expanded rows to bound large-list rendering. Backlog levels promote Features, User Stories or Tasks to the top level without changing their source relationships.

Order is a displayed root-row number, not a write to Azure backlog priority.

### Large browser datasets and storage recovery

Full app data now uses **IndexedDB**, not the small synchronous localStorage snapshot. PATs, connection configuration and column preferences remain separate small browser settings. On first use of this version, an empty IndexedDB imports the previously saved `demand-planning-mvp-v1` snapshot; the old copy is retained, not deleted. Once IndexedDB contains data it takes precedence, so an older legacy snapshot cannot overwrite a newer database. A database read failure or malformed backup blocks startup rather than replacing saved data with demo records. No initial seed is saved before hydration completes.

Autosaves are debounced and serialized; a save is confirmed only on IndexedDB transaction completion. Failed/aborted saves retain the previous committed data, show a persistent warning, offer direct JSON backup and retry controls, and warn on closing with pending saves. Browser privacy policy, disk limits, eviction and clearing site data can still affect persistence. This is browser-local storage, **not** a multi-user central database or a guarantee of unlimited space.

If the old version displays a storage-full warning, keep that tab open and first use **Snapshots → Portable data → JSON**. Open the updated version separately, then use **Snapshots → Browser storage & backup recovery** to select the JSON file, review counts and confirm replacement. Restore does not write to Azure DevOps and is disabled while SharePoint is connected. Wait for a confirmed browser save before closing the old tab. Backups contain app records but not the PAT; protect them as internal data. In-memory-only changes in an old tab cannot be recovered automatically after that tab is reloaded or closed.

`pnpm test:azure` runs both Azure integration checks and storage tests, including a 14,000-item synthetic backlog, legacy migration, failed reads, serialization, aborts and backup validation. `tests/browser-storage-preview.html` is a local-only UI fixture using a separate synthetic test database; it never opens the real app database.

New Features are assigned to the Feature creator email saved in the active ADS configuration (not the app's local demo user, and not the PAT identity GUID, which Azure DevOps does not accept as Assigned To). The assignment is verified after Feature creation. Tokens remain outside exported app state.

Opening the creation form reads team iterations and the project iteration tree. Dated leaf iterations containing today's India calendar date are treated as Sprint candidates; their nearest dated ancestor is the PI. Team-configured Sprint candidates take precedence. Start and finish days are inclusive. A unique pair is preselected; overlapping branches require explicit selection and missing dates/nesting block creation until corrected in Azure settings. The mapping is shown for review: **Feature → PI; all new User Stories → Sprint; Time Writing Task → project root**. Dates are rechecked before a write. Existing Feature/child iterations are not silently changed during completion; conflicting existing children require manual review in Azure.

No production data, tenant identifiers, access tokens, client secrets or employee information belong in Git. The local adapter persists synthetic development records in browser storage.

The central-data MVP uses Microsoft identity delegated authentication and one versioned JSON file in the site's default SharePoint document library. The browser never stores a client secret. An ETag prevents one user from silently overwriting a newer central version.

The migration page accepts the exact 17-column shape of `Demand Planning _ Projects and Services(TransformedData).csv`. Source workbook data must never be committed to this repository.

## Production prerequisites

1. Microsoft Entra single-page application registration with the GitHub Pages and localhost redirect URIs. The Tenant ID is optional in the app; when omitted, Microsoft work-account sign-in discovers it.
2. Approved delegated `User.Read` and `Sites.ReadWrite.All` permissions, or a narrower approved replacement.
3. Access to the I&D Quality SharePoint site and its default document library.
4. Windows code-signing and an approved software distribution route.
5. Authoritative migration workbook access and mapping sign-off.
6. UAT owner, rollback procedure and operational support ownership.

## Planned adapters

- `IndexedDBStateRepository` — offline/local app cache with legacy localStorage migration and JSON recovery
- `SharePointStateClient` — central JSON state with Microsoft sign-in and optimistic concurrency
- `ReleaseImportAdapter` — mapped CSV/Excel exports from TFS and Windchill
- `ReportingAdapter` — PDF, PNG and 2-slide PowerPoint generation
- `InsightsAdapter` — governed AI summaries with source traceability

## Maintenance-risk controls

The solution is intentionally documented, typed, version-controlled and adapter-based to reduce the in-house single-maintainer risk. Before production, Philips should nominate a secondary maintainer, use pull-request review, keep deployment/runbook documentation, and conduct a recorded handover with restore testing.
