// Role-based access: which menu areas each role sees and which actions it may take, and which roles each person
// (by the email of their Azure DevOps PAT) has. The policy is access.json in the Git data repository, next to the
// planning data, so only people who can write to that repository can change it. Without the file, everyone has every
// right (the app works as before). This decides what the app shows; Azure DevOps and GitHub still decide what each
// person's own tokens can read and change.
// CON-93: Tool Owner — the only role that changes the stream mapping and its query logic (streams.manage).
export const roles = ['Tool Owner', 'Admin', 'Product Owner', 'People Manager', 'Scrum Master', 'Team Member'] as const
export type Role = typeof roles[number]

export const areas = [
  { key: 'overview', label: 'My dashboard' },
  // MYD-05: the team's insights for selected roles only (Dashboard, Pulse Check, PI Review); My dashboard is for everyone.
  { key: 'insights', label: 'Team insights (Team overview, Pulse Check, PI Review)' },
  { key: 'mywork', label: 'My Tasks [Board]' },
  { key: 'bulk', label: 'Sprint check' },
  { key: 'monthly', label: 'Time Writing' },
  { key: 'board', label: 'I&D Board backlogs' },
  { key: 'health', label: 'Backlog Health' },
  { key: 'release', label: 'Release Details (on-prem views, Windchill exports)' },
  { key: 'baselines', label: 'Baselines' },
  { key: 'qemapping', label: 'QE Mapping' },
  { key: 'snapshots', label: 'Snapshots' },
  { key: 'docs', label: 'Documentation' },
] as const
export type Area = typeof areas[number]['key']

export const actions = [
  { key: 'azure.write', label: 'Change work items in Azure DevOps (Time Writing, My Tasks [Board], Sprint check, new Features)' },
  { key: 'azure.createForOthers', label: 'Create work items for other people (choose who they are assigned to)' },
  { key: 'baselines.edit', label: 'Edit baselines (rules and release scope)' },
  { key: 'windchill.import', label: 'Import Windchill exports' },
  { key: 'settings.manage', label: 'Manage shared settings (capacity, resources, master data, shared connection setup)' },
  { key: 'access.manage', label: 'Manage access (roles and members)' },
  { key: 'streams.manage', label: 'Change the stream mapping and its query logic: servers, projects and queries of the streams, their data sets, release naming (Tool Owner)' },
] as const
export type Action = typeof actions[number]['key']

export interface RoleRights { areas: Area[]; actions: Action[] }
export interface AccessPolicy { schema: 1; defaultRole: Role | null; roles: Record<Role, RoleRights>; members: Record<string, Role[]> }
export interface Rights { areas: Set<Area>; actions: Set<Action>; roles: Role[]; restricted: boolean }

const allAreas = areas.map((entry) => entry.key) as Area[]
const allActions = actions.map((entry) => entry.key) as Action[]
const myWork: Area[] = ['mywork', 'bulk', 'monthly']

export const accessFile = 'access.json'
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
export const normalEmail = (value: string) => value.trim().toLowerCase()

// The starting matrix (editable in Settings → Access): Backlog Health only for Scrum Masters, Product Owners and Admins.
export function defaultPolicy(adminEmail = ''): AccessPolicy {
  return {
    schema: 1,
    defaultRole: 'Team Member',
    roles: {
      'Tool Owner': { areas: [...allAreas], actions: [...allActions] },
      'Admin': { areas: [...allAreas], actions: allActions.filter((action) => action !== 'streams.manage') },
      'Product Owner': { areas: ['overview', 'board', 'health', 'release', 'baselines', 'qemapping', 'docs'], actions: ['azure.write', 'azure.createForOthers', 'baselines.edit'] },
      'People Manager': { areas: ['overview', 'insights', ...myWork, 'board', 'release', 'baselines', 'qemapping', 'snapshots', 'docs'], actions: ['azure.write', 'azure.createForOthers', 'baselines.edit'] },
      'Scrum Master': { areas: ['overview', ...myWork, 'board', 'health', 'release', 'docs'], actions: ['azure.write', 'azure.createForOthers'] },
      'Team Member': { areas: ['overview', ...myWork, 'board', 'release', 'docs'], actions: ['azure.write'] },
    },
    members: isEmail(adminEmail) ? { [normalEmail(adminEmail)]: ['Admin'] } : {},
  }
}

const pick = <T extends string>(value: unknown, allowed: readonly T[]) => Array.isArray(value) ? allowed.filter((entry) => value.includes(entry)) : []

// Reads access.json: unknown roles, areas, actions and invalid emails are dropped; a role missing from the file has no
// rights. Throws on anything that is not an access policy, so a broken file is reported rather than ignored.
export function parseAccess(text: string): AccessPolicy {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error(`${accessFile} is not valid JSON.`) }
  const input = raw as Partial<Record<keyof AccessPolicy, unknown>> | null
  if (!input || typeof input !== 'object' || input.schema !== 1 || !input.roles || typeof input.roles !== 'object' || !input.members || typeof input.members !== 'object') throw new Error(`${accessFile} is not an access file (schema 1 with roles and members).`)
  const rolesIn = input.roles as Record<string, Partial<Record<keyof RoleRights, unknown>> | undefined>
  const members: Record<string, Role[]> = {}
  for (const [email, value] of Object.entries(input.members as Record<string, unknown>)) {
    const assigned = pick(value, roles)
    if (isEmail(email) && assigned.length) members[normalEmail(email)] = [...new Set([...(members[normalEmail(email)] ?? []), ...assigned])]
  }
  // A file written before Team insights existed: the roles that saw the Data Insights then and lead people (Admin,
  // People Manager) keep the team's insights; every other role keeps My dashboard only.
  const before = !Object.values(rolesIn).some((role) => Array.isArray(role?.areas) && role.areas.includes('insights'))
  const areasOf = (role: Role) => { const listed = pick(rolesIn[role]?.areas, allAreas); return before && listed.includes('overview') && (role === 'Tool Owner' || role === 'Admin' || role === 'People Manager') ? allAreas.filter((area) => listed.includes(area) || area === 'insights') : listed }
  return {
    schema: 1,
    defaultRole: roles.includes(input.defaultRole as Role) ? input.defaultRole as Role : null,
    // CON-93: a file written before the Tool Owner role keeps its roles; Tool Owner gets every right until it is set.
    roles: Object.fromEntries(roles.map((role) => [role, role === 'Tool Owner' && !rolesIn[role] ? { areas: [...allAreas], actions: [...allActions] } : { areas: areasOf(role), actions: pick(rolesIn[role]?.actions, allActions) }])) as Record<Role, RoleRights>,
    members,
  }
}

export function serializeAccess(policy: AccessPolicy) {
  const members = Object.fromEntries(Object.entries(policy.members).filter(([email, assigned]) => isEmail(email) && assigned.length).sort(([a], [b]) => a.localeCompare(b)).map(([email, assigned]) => [normalEmail(email), roles.filter((role) => assigned.includes(role))]))
  return `${JSON.stringify({ schema: 1, defaultRole: policy.defaultRole, roles: Object.fromEntries(roles.map((role) => [role, { areas: allAreas.filter((area) => policy.roles[role].areas.includes(area)), actions: allActions.filter((action) => policy.roles[role].actions.includes(action)) }])), members }, null, 2)}\n`
}

// A person's rights: the union of their roles, or the default role when their email is not listed (or not known yet).
// No policy = no restrictions.
export function rightsFor(policy: AccessPolicy | null, email: string): Rights {
  if (!policy) return { areas: new Set(allAreas), actions: new Set(allActions), roles: [], restricted: false }
  const listed = email ? policy.members[normalEmail(email)] ?? [] : []
  const assigned = listed.length ? listed : policy.defaultRole ? [policy.defaultRole] : []
  return {
    areas: new Set(assigned.flatMap((role) => policy.roles[role].areas)),
    actions: new Set(assigned.flatMap((role) => policy.roles[role].actions)),
    roles: assigned,
    restricted: true,
  }
}

// A policy may not lock its editor out: the person saving it must keep a role that can manage access.
export function keepsManager(policy: AccessPolicy, email: string) {
  return Boolean(email) && rightsFor(policy, email).actions.has('access.manage')
}

// CON-93: whether anyone holds the stream mapping (a listed member, or everyone through the default role, with
// streams.manage). Until someone does, the people who manage access may change it, so nobody is locked out.
export function toolOwnerExists(policy: AccessPolicy | null) {
  if (!policy) return false
  const holds = (role: Role) => policy.roles[role]?.actions.includes('streams.manage')
  return Object.values(policy.members).some((assigned) => assigned.some(holds)) || Boolean(policy.defaultRole && holds(policy.defaultRole))
}
export function canManageStreams(policy: AccessPolicy | null, rights: Pick<Rights, 'actions'>) {
  return !policy || rights.actions.has('streams.manage') || (!toolOwnerExists(policy) && rights.actions.has('access.manage'))
}
// CON-93: who holds the stream mapping (members with streams.manage, and the default role's) and whether a change to
// the policy touches it — only someone who may change the stream mapping may change who holds it, and a policy that
// had a holder must keep one.
const streamHolders = (policy: AccessPolicy) => JSON.stringify({ members: Object.entries(policy.members).filter(([, assigned]) => assigned.some((role) => policy.roles[role]?.actions.includes('streams.manage'))).map(([email]) => email).sort(), roles: roles.filter((role) => policy.roles[role]?.actions.includes('streams.manage')), defaultRole: policy.defaultRole && policy.roles[policy.defaultRole]?.actions.includes('streams.manage') ? policy.defaultRole : null })
export function toolOwnerChange(before: AccessPolicy | null, after: AccessPolicy, email: string): string {
  if (before && streamHolders(before) === streamHolders(after)) return ''
  if (before && !canManageStreams(before, rightsFor(before, email))) return 'Only a Tool Owner can change who holds the stream mapping (the Tool Owner role and “Change the stream mapping”).'
  if (toolOwnerExists(before) && !toolOwnerExists(after)) return 'Keep at least one Tool Owner: the stream mapping would have no owner.'
  return ''
}
