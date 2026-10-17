import type { AzureWorkItem } from './domain'
import type { AzureBacklogScope, AzureConfig } from './azureDevOps'
import type { ReleaseSourceSnapshot } from './releaseSource'

// Deterministic synthetic dataset in the exact shape the app reads from Azure DevOps, so every page can be
// exercised without a connection. Clearly labelled as sample data wherever it is shown; never written to Azure.
const people = ['Ana Costa', 'Ben Okafor', 'Chen Wei', 'Diya Sharma', 'Emil Novak', 'Fatima Zahra']
const streams = [
  { epic: 'IntelliSpace Platform', features: ['IntelliSpace | Cardio Suite | v4.2', 'IntelliSpace | Image Share | v2.0'], npra: false },
  { epic: 'DoseWise Portal', features: ['DoseWise | Dose Monitoring | v3.1', 'DoseWise | Reporting | v1.6'], npra: true },
  { epic: 'Data Migration Services', features: ['Migration | PACS Transfer | v7.0'], npra: false },
  { epic: 'Regulatory & Compliance', features: ['Compliance | DHF Remediation | v1.0', 'Compliance | MDR Audit | v2.3'], npra: true },
  { epic: 'Customer Support Fixes', features: ['Support | Hotfix Bundle | v4.2.1'], npra: false },
]
const absenceEpicId = 37778
const absenceKinds = ['PTO', 'Sick leave', 'Unplanned leave']
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Small seeded generator so the sample is stable between loads and screenshots.
function random(seed: number) { let state = seed >>> 0; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296 } }

function monthLabel(month: string) { const [year, index] = month.split('-').map(Number); return `${months[index - 1]} ${year}` }
function shiftMonth(month: string, offset: number) { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + offset); return date.toISOString().slice(0, 7) }

export function sampleDataset(config: AzureConfig, month: string): { items: AzureWorkItem[]; scope: AzureBacklogScope; releaseSource: ReleaseSourceSnapshot } {
  const next = random(20261017)
  const team = config.team || 'Sample Team'
  const areaPath = `${config.project}\\${team}`
  const fetchedAt = new Date().toISOString()
  const items: AzureWorkItem[] = []
  let id = 100000
  const make = (partial: Partial<AzureWorkItem> & { title: string; workItemType: string }): AzureWorkItem => {
    const itemId = ++id
    const item: AzureWorkItem = {
      key: `${config.organization.toLowerCase()}/${config.project.toLowerCase()}/${itemId}`, id: itemId, organization: config.organization, project: config.project,
      state: 'Active', assignedTo: '', areaPath, iterationPath: `${config.project}\\PI 2026.4`, tags: '', syncedAt: fetchedAt,
      url: `https://dev.azure.com/${encodeURIComponent(config.organization)}/${encodeURIComponent(config.project)}/_workitems/edit/${itemId}`,
      ...partial,
    }
    items.push(item)
    return item
  }
  const monthKeys = Array.from({ length: 6 }, (_, index) => shiftMonth(month, index - 5))
  let personIndex = 0
  streams.forEach((stream, streamIndex) => {
    const epic = make({ title: stream.epic, workItemType: 'Epic', state: 'Active' })
    stream.features.forEach((title, featureIndex) => {
      const owner = people[personIndex++ % people.length]
      const closed = streamIndex === 4 || (streamIndex === 0 && featureIndex === 1)
      const feature = make({ title, workItemType: 'Feature', parentId: epic.id, assignedTo: owner, state: closed ? 'Closed' : 'Active', tags: stream.npra && featureIndex === 0 ? 'NPRA Hours' : '', originalEstimate: stream.npra && featureIndex === 0 ? 120 : undefined, targetDate: `${shiftMonth(month, closed ? 0 : 1)}-${String(10 + featureIndex * 7).padStart(2, '0')}T00:00:00Z`, closedDate: closed ? `${month}-${String(6 + streamIndex * 3).padStart(2, '0')}T14:00:00Z` : undefined })
      for (const milestone of ['SFV', 'DT']) make({ title: `${title} | ${milestone} review of deliverables`, workItemType: 'User Story', parentId: feature.id, assignedTo: owner, state: milestone === 'SFV' ? 'Closed' : 'Active', iterationPath: `${config.project}\\PI 2026.4\\Sprint 2` })
      const story = make({ title: `${title} - Time Writing`, workItemType: 'User Story', parentId: feature.id, assignedTo: owner, iterationPath: `${config.project}\\PI 2026.4\\Sprint 2` })
      const helpers = [owner, people[(personIndex + 2) % people.length]]
      monthKeys.forEach((key, monthOffset) => {
        helpers.forEach((person, helperIndex) => {
          if (helperIndex === 1 && (streamIndex + monthOffset) % 3 === 0) return
          const base = helperIndex === 0 ? 48 + streamIndex * 12 : 20 + streamIndex * 4
          const plan = Math.round((base + next() * 24) * 4) / 4
          const ratio = 0.8 + next() * (streamIndex === 1 ? 0.7 : 0.45)
          const actual = key > month ? undefined : Math.round(plan * ratio * 4) / 4
          make({ title: `${monthLabel(key)} | ${title}`, workItemType: 'Task', parentId: story.id, assignedTo: person, state: key < month ? 'Closed' : 'Active', iterationPath: config.project, originalEstimate: plan, completedWork: actual, tags: streamIndex === 4 && monthOffset === 5 && helperIndex === 1 ? 'ad-hoc' : '' })
        })
      })
    })
  })
  // Absence: one Feature per person under the absence Epic, a Time Writing story, and month Tasks per leave kind.
  const absenceEpic = make({ title: 'Absence & Leave', workItemType: 'Epic', state: 'Active' })
  items[items.length - 1] = { ...absenceEpic, id: absenceEpicId, key: `${config.organization.toLowerCase()}/${config.project.toLowerCase()}/${absenceEpicId}`, url: absenceEpic.url.replace(String(absenceEpic.id), String(absenceEpicId)) }
  people.forEach((person, index) => {
    const feature = make({ title: `${person} - Absence`, workItemType: 'Feature', parentId: absenceEpicId, assignedTo: person })
    const story = make({ title: `${person} - Time Writing`, workItemType: 'User Story', parentId: feature.id, assignedTo: person })
    monthKeys.forEach((key, monthOffset) => {
      absenceKinds.forEach((kind, kindIndex) => {
        const hours = kindIndex === 0 ? (index + monthOffset) % 3 === 0 ? 16 : (index + monthOffset) % 4 === 0 ? 40 : 0 : kindIndex === 1 ? ((index * 7 + monthOffset * 3) % 5 === 0 ? 8 : 0) : ((index + monthOffset) % 7 === 0 ? 4 : 0)
        if (!hours || key > month) return
        make({ title: `${monthLabel(key)} | ${person} - ${kind}`, workItemType: 'Task', parentId: story.id, assignedTo: person, state: key < month ? 'Closed' : 'Active', iterationPath: config.project, completedWork: hours })
      })
    })
  })
  const scope: AzureBacklogScope = { organization: config.organization, project: config.project, team, itemKeys: items.map((item) => item.key), areaPaths: [areaPath], fetchedAt }
  // Read-only release source: approved design-history documents whose Area Path carries the release identifier.
  const releases = [
    ['IntelliSpace Platform', ['v4.2', 'v4.1', 'v2.0']], ['DoseWise Portal', ['v3.1', 'v3.0', 'v1.6', 'v1.5']], ['Data Migration Services', ['v7.0']],
    ['Regulatory & Compliance', ['v1.0', 'v2.3', 'v2.2']], ['Customer Support Fixes', ['v4.2.1', 'v4.1.3']], ['Legacy Viewer', ['v9.8']],
  ] as const
  const docs: AzureWorkItem[] = []
  let docId = 500000
  for (const [stream, versions] of releases) for (const version of versions) for (let copy = 0; copy < 1 + (version.endsWith('.0') ? 1 : 0); copy++) {
    const itemId = ++docId
    docs.push({ key: `${config.organization.toLowerCase()}/dhfi/${itemId}`, id: itemId, organization: config.organization, project: 'DHFI', title: `${copy ? 'Verification Summary' : 'Design Review Approval'} — ${stream} ${version}`, workItemType: 'Document', state: 'Approved', assignedTo: '', areaPath: `DHFI\\${stream}\\${version}`, iterationPath: 'DHFI', tags: '', syncedAt: fetchedAt, url: `https://dev.azure.com/${encodeURIComponent(config.organization)}/DHFI/_workitems/edit/${itemId}` })
  }
  return { items, scope, releaseSource: { organization: config.organization, project: 'DHFI', query: "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] = 'Approved'", fetchedAt, items: docs } }
}
