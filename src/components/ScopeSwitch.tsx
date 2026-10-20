import type { PersonScope } from '../usePersonScope'

// Team / Individual toggle with a person picker (defaults to me).
export function ScopeSwitch({ scope, label, note }: { scope: PersonScope; label: string; note?: string }) {
  const { view, setView, individual, person, setPerson, my } = scope
  return <div className="view-switch" role="group" aria-label={label}>
    <span>{label}</span>
    <div className="segmented">{(['individual', 'team'] as const).map((value) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}>{value === 'team' ? 'Team' : 'Individual'}</button>)}</div>
    {individual && <select aria-label="Person" value={person} onChange={(event) => setPerson(event.target.value)}><option value="">{my.known ? `Me (${my.me.name ?? my.me.email})` : 'Choose a person…'}</option>{my.people.map((name) => <option key={name}>{name}</option>)}</select>}
    {individual && note && <small>{note}</small>}
  </div>
}
