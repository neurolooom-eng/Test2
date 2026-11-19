import type { AzureWorkItem } from './domain'
import { ifEmptyOptions, type EpicSetupFile } from './epicSetup.ts'
import { chooseSetup, setupFor, type FeatureSetups } from './featureSetup.ts'

// EPS-08: the rows of All Epic setups.
export interface EpicSetupRow { epicId: number; title: string; fields: string[]; pattern: string; shared: boolean; mine: boolean; dod: string; stories: number }
export function epicSetupRows(epicFile: EpicSetupFile | null, setups: FeatureSetups | null, items: Pick<AzureWorkItem, 'id' | 'title' | 'workItemType'>[]): EpicSetupRow[] {
  const ids = new Set([...(epicFile?.epics ?? []).filter((entry) => entry.fields.length).map((entry) => entry.epicId), ...(setups?.shared?.epics ?? []).map((entry) => entry.epicId), ...(setups?.personal?.epics ?? []).map((entry) => entry.epicId)])
  const empty = (key: string) => ifEmptyOptions.find((option) => option.key === key)?.label ?? key
  return [...ids].map((epicId) => {
    const epic = epicFile?.epics.find((entry) => entry.epicId === epicId)
    const shared = setupFor(setups?.shared ?? null, epicId), mine = setupFor(setups?.personal ?? null, epicId)
    const used = chooseSetup(setups, epicId).setup
    const title = items.find((item) => item.id === epicId && item.workItemType === 'Epic')?.title || epic?.epicTitle || shared?.epicTitle || mine?.epicTitle || ''
    return { epicId, title, fields: (epic?.fields ?? []).map((field) => `${field.label}${field.type === 'list' ? ' (list)' : field.source ? ' (on-prem)' : ''}${field.ifEmpty !== 'optional' ? ` · ${empty(field.ifEmpty)}` : ''}`), pattern: epic?.titlePattern ?? '', shared: Boolean(shared), mine: Boolean(mine), dod: used?.featureDoD ?? '', stories: used?.stories.length ?? 0 }
  }).sort((a, b) => a.title.localeCompare(b.title) || a.epicId - b.epicId)
}

