import { useState } from 'react'
import { describeRule, exampleBaselineRules, normalizeRules, type BaselineItem, type BaselineRule } from '../baseline'
import { Notice, Panel } from './ui'

// Editor for the estimation rules: per stream, fixed hours by release type, priced line items whose units grow with a
// driver (documents, assets, …) and an optional cap. Works on a local draft; Save normalises and stores it.
export function BaselineRulesEditor({ rules, streams, onSave }: { rules: BaselineRule[]; streams: string[]; onSave: (rules: BaselineRule[]) => void }) {
  const [draft, setDraft] = useState<BaselineRule[]>(rules)
  const [saved, setSaved] = useState('')
  const dirty = JSON.stringify(normalizeRules(draft)) !== JSON.stringify(rules)
  const update = (index: number, change: (rule: BaselineRule) => BaselineRule) => { setSaved(''); setDraft((current) => current.map((rule, position) => position === index ? change(rule) : rule)) }
  const number = (value: string) => value === '' ? 0 : Number(value)
  const unused = streams.filter((stream) => !draft.some((rule) => rule.stream.toLowerCase() === stream.toLowerCase()))

  function setType(index: number, oldName: string, name: string, hours: number) {
    update(index, (rule) => ({ ...rule, types: Object.fromEntries(Object.entries(rule.types).map(([key, value]) => key === oldName ? [name, hours] : [key, value])) }))
  }
  function setItem(index: number, itemIndex: number, patch: Partial<BaselineItem>) {
    update(index, (rule) => ({ ...rule, items: rule.items.map((item, position) => position === itemIndex ? { ...item, ...patch } : item) }))
  }

  return <Panel className="admin-section" eyebrow="BASELINE" title="Estimation rules" detail="How a release's baseline is calculated per stream: fixed hours by release type, plus line items priced per unit, where units = base units + driver count × units per driver (e.g. CP documents: 2h × (14 + 11 × assets)), with an optional maximum. Values shown are examples until the exact baseline is entered."
    action={<div className="button-row"><button type="button" className="ghost" onClick={() => { setSaved(''); setDraft(exampleBaselineRules) }}>Load example values</button><button type="button" className="primary" disabled={!dirty} onClick={() => { const next = normalizeRules(draft); onSave(next); setDraft(next); setSaved('Estimation rules saved.') }}>Save rules</button></div>}>
    {saved && <Notice tone="success">{saved}</Notice>}
    <div className="rule-list">
      {draft.map((rule, index) => <section className="rule-card" key={index}>
        <div className="rule-head"><label>Stream (Epic title)<input value={rule.stream} onChange={(event) => update(index, (current) => ({ ...current, stream: event.target.value }))} /></label><label>Maximum hours per release<input type="number" min="0" step="0.25" value={rule.cap ?? ''} placeholder="No maximum" onChange={(event) => update(index, (current) => ({ ...current, cap: event.target.value === '' ? undefined : number(event.target.value) }))} /></label><button type="button" className="text-button" onClick={() => { setSaved(''); setDraft((current) => current.filter((_, position) => position !== index)) }}>Remove stream</button></div>
        <div className="rule-grid">
          <div><h4>Fixed hours by release type</h4>
            <table className="rule-table"><thead><tr><th>Type</th><th>Hours</th><th /></tr></thead><tbody>{Object.entries(rule.types).map(([name, hours], typeIndex) => <tr key={typeIndex}><td><input aria-label="Release type" value={name} onChange={(event) => setType(index, name, event.target.value, hours)} /></td><td><input aria-label={`Hours for ${name}`} type="number" min="0" step="0.25" value={hours} onChange={(event) => setType(index, name, name, number(event.target.value))} /></td><td><button type="button" className="text-button" aria-label={`Remove ${name}`} onClick={() => update(index, (current) => ({ ...current, types: Object.fromEntries(Object.entries(current.types).filter(([key]) => key !== name)) }))}>✕</button></td></tr>)}</tbody></table>
            <button type="button" className="text-button" onClick={() => update(index, (current) => ({ ...current, types: { ...current.types, [`Type ${Object.keys(current.types).length + 1}`]: 0 } }))}>＋ Release type</button>
          </div>
          <div><h4>Line items</h4>
            <table className="rule-table"><thead><tr><th>Item</th><th>Hours per unit</th><th>Base units</th><th>Driver</th><th>Units per driver</th><th /></tr></thead><tbody>{rule.items.map((item, itemIndex) => <tr key={itemIndex}>
              <td><input aria-label="Item" value={item.label} onChange={(event) => setItem(index, itemIndex, { label: event.target.value })} /></td>
              <td><input aria-label="Hours per unit" type="number" min="0" step="0.05" value={item.hoursPerUnit} onChange={(event) => setItem(index, itemIndex, { hoursPerUnit: number(event.target.value) })} /></td>
              <td><input aria-label="Base units" type="number" min="0" step="1" value={item.baseUnits} onChange={(event) => setItem(index, itemIndex, { baseUnits: number(event.target.value) })} /></td>
              <td><input aria-label="Driver" placeholder="e.g. assets" value={item.driver ?? ''} onChange={(event) => setItem(index, itemIndex, { driver: event.target.value || undefined })} /></td>
              <td><input aria-label="Units per driver" type="number" min="0" step="1" value={item.unitsPerDriver ?? ''} placeholder="—" onChange={(event) => setItem(index, itemIndex, { unitsPerDriver: event.target.value === '' ? undefined : number(event.target.value) })} /></td>
              <td><button type="button" className="text-button" aria-label={`Remove ${item.label}`} onClick={() => update(index, (current) => ({ ...current, items: current.items.filter((_, position) => position !== itemIndex) }))}>✕</button></td>
            </tr>)}</tbody></table>
            <button type="button" className="text-button" onClick={() => update(index, (current) => ({ ...current, items: [...current.items, { label: 'Documents', hoursPerUnit: 0, baseUnits: 0 }] }))}>＋ Line item</button>
          </div>
        </div>
        <p className="rule-formula"><strong>Formula</strong> {describeRule(normalizeRules([rule])[0] ?? rule)}</p>
      </section>)}
    </div>
    <div className="button-row rule-add">{unused.length > 0 && <select aria-label="Add a rule for stream" value="" onChange={(event) => { if (!event.target.value) return; setSaved(''); setDraft((current) => [...current, { stream: event.target.value, types: {}, items: [] }]) }}><option value="">＋ Add rule for a stream…</option>{unused.map((stream) => <option key={stream}>{stream}</option>)}</select>}<button type="button" className="ghost" onClick={() => { setSaved(''); setDraft((current) => [...current, { stream: '', types: {}, items: [] }]) }}>＋ Custom stream</button></div>
  </Panel>
}
