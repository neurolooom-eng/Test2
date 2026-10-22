import { useId, useState } from 'react'

// Type to search a person: the list narrows as you type, and a name from it is chosen. Empty means the default (me).
export function PersonPicker({ value, people, onChange, placeholder, label }: { value: string; people: string[]; onChange: (name: string) => void; placeholder: string; label: string }) {
  const listId = useId()
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  if (shown !== value) { setShown(value); setText(value) }
  const pick = (input: string) => {
    setText(input)
    const match = people.find((person) => person.toLowerCase() === input.trim().toLowerCase())
    if (match) onChange(match)
    else if (!input.trim()) onChange('')
  }
  const unknown = text.trim() !== '' && !people.some((person) => person.toLowerCase() === text.trim().toLowerCase())
  return <span className="person-picker">
    <input type="search" aria-label={label} list={listId} value={text} placeholder={placeholder} onChange={(event) => pick(event.target.value)} onBlur={() => { if (unknown) setText(value) }} />
    <datalist id={listId}>{people.map((person) => <option key={person} value={person} />)}</datalist>
    {value && <button type="button" className="text-button" onClick={() => pick('')} title="Back to me">✕</button>}
  </span>
}
