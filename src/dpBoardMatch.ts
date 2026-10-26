import type { AzureWorkItem } from './domain'
import { isTimeWritingStory } from './azureInsights.ts'
import { fieldOf } from './dpReleases.ts'
import { nameScore, prepareName, prepareTitle, type PreparedName, type PreparedTitle } from './releaseSource.ts'

// DP row → QMS-0025 board: the Feature and the User Story whose title matches the row's SourceProgram and Title.
// Not everyone writes the SourceProgram into the board title, so the score is the better of Title alone and
// SourceProgram + Title (nameScore: the name whole in the title or a "|" part, else bigram similarity, scaled by the
// share of its telling words in the title; versions are left out). A match needs the threshold (80% by default);
// the closest item below it is kept as a hint. Time Writing stories and removed items are not candidates.
export interface BoardHit { item: AzureWorkItem; score: number }
export interface BoardMatch { feature?: BoardHit; story?: BoardHit; closest?: BoardHit }

export const dpProgramOf = (item: AzureWorkItem) => fieldOf(item, 'SourceProgram')?.trim() ?? ''
const versions = /\bv?\d+(\.\d+)+\b/gi
// The row's Title without its version, as the Service part of a new Feature title.
export const dpServiceOf = (item: AzureWorkItem) => item.title.replace(versions, ' ').replace(/\s+/g, ' ').trim()

const names = (title: string, program: string): PreparedName[] => program && !title.toLowerCase().includes(program.toLowerCase()) ? [prepareName(title), prepareName(title, program)] : [prepareName(title)]
export function dpTitleScore(boardTitle: string | PreparedTitle, title: string, program = '') {
  const ready = typeof boardTitle === 'string' ? prepareTitle(boardTitle) : boardTitle
  return Math.round(100 * Math.max(0, ...names(title, program).map((name) => nameScore(ready, name))))
}

export function dpBoardCandidates(board: AzureWorkItem[]) {
  return board.filter((item) => (item.workItemType === 'Feature' || item.workItemType === 'User Story') && item.state.trim().toLowerCase() !== 'removed' && !isTimeWritingStory(item)).map((item) => ({ item, ready: prepareTitle(item.title) }))
}
export type DpBoardCandidates = ReturnType<typeof dpBoardCandidates>

export function dpBoardMatch(row: AzureWorkItem, candidates: DpBoardCandidates, threshold = 80): BoardMatch {
  const program = dpProgramOf(row), wanted = names(row.title, program)
  // Only items sharing a telling word (or the squashed name) with the row are scored.
  const keys = [...new Set(wanted.flatMap((name) => name.words.length ? name.words : name.wanted.length >= 2 ? [name.wanted] : []))]
  if (!keys.length) return {}
  const hits = candidates.filter(({ ready }) => keys.some((key) => ready.flat.includes(key)))
    .map(({ item, ready }) => ({ item, score: Math.round(100 * Math.max(...wanted.map((name) => nameScore(ready, name)))) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.item.id - b.item.id)
  const best = (type: string) => hits.find((hit) => hit.item.workItemType === type && hit.score >= threshold)
  const feature = best('Feature'), story = best('User Story')
  return { ...(feature ? { feature } : {}), ...(story ? { story } : {}), ...(!feature && !story && hits[0] ? { closest: hits[0] } : {}) }
}

export const boardMatchText = (match: BoardMatch) => [match.feature && `Feature ${match.feature.item.id} (${match.feature.score}%)`, match.story && `User Story ${match.story.item.id} (${match.story.score}%)`].filter(Boolean).join('; ') || (match.closest ? `No match (closest ${match.closest.item.workItemType} ${match.closest.item.id}, ${match.closest.score}%)` : 'No match')
