import { filterPalettes } from '../utils/paletteSearch';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { useSavedPalettes } from '../hooks/useSavedPalettes';
import { PaletteCreateForm } from './PaletteCreateForm';

const modes = ['existing', 'new'] as const;
type PickerMode = typeof modes[number];

export function PalettePicker({ hex, palettes, disabled }: {
  hex: string; palettes: ReturnType<typeof useSavedPalettes>; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PickerMode>('existing');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState('');
  const [message, setMessage] = useState('');
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const modeButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (open) modeButtons.current[0]?.focus(); }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const restoreFocus = () => requestAnimationFrame(() => {
    const picker = document.getElementById(id);
    if (mounted.current && picker && !picker.hidden && document.activeElement === document.body) {
      picker.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
    }
  });
  const blocked = disabled || palettes.pending || palettes.loading;
  return (
    <div className="palette-picker">
      <button type="button" className="history-text-button" ref={trigger} disabled={disabled || palettes.pending}
        aria-expanded={open} aria-controls={id} onClick={() => {
          if (open) close(); else { setMode('existing'); setMessage(''); setOpen(true); }
        }}>Add to palette</button>
      <div hidden={!open} id={id} className="palette-picker-content" role="group" aria-labelledby={`${id}-heading`}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
        <div className="palette-picker-heading">
          <div>
            <p className="editorial-label">SAVE YOUR COLOR</p>
            <h3 id={`${id}-heading`} className="inspector-heading font-editorial">add to a palette.</h3>
          </div>
          <button type="button" className="copy-color" aria-label="Close palette picker" onClick={close}>
            <X aria-hidden="true" className="copy-icon" />
          </button>
        </div>
        <div className="palette-selected-color">
          <span aria-hidden="true" style={{ backgroundColor: hex }} /> <span>{hex}</span>
        </div>
        <div role="tablist" aria-label="Palette saving mode" className="palette-modes">
          {modes.map((item, index) => <button key={item} type="button" role="tab"
            id={`${id}-${item}-tab`} aria-controls={`${id}-panel`} aria-selected={mode === item}
            tabIndex={mode === item ? 0 : -1} disabled={blocked}
            ref={element => { modeButtons.current[index] = element; }}
            onClick={() => { setMode(item); setMessage(''); }}
            onKeyDown={event => {
              let next: number | undefined;
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = 1 - index;
              if (event.key === 'Home') next = 0;
              if (event.key === 'End') next = 1;
              if (next !== undefined) {
                event.preventDefault(); setMode(modes[next]); setMessage(''); modeButtons.current[next]?.focus();
              }
            }}>{item === 'existing' ? 'Existing palette' : 'New palette'}</button>)}
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${mode}-tab`}>
          {mode === 'existing' ? palettes.palettes.length > 0 ? (
            <div className="palette-existing">
              <label htmlFor={`${id}-search`}>Choose a palette</label>
              <input type="search" id={`${id}-search`} className="palette-search" placeholder="Search palettes" value={search}
                disabled={blocked} onChange={event => setSearch(event.target.value)} />
              <ul className="palette-options" aria-label="Matching palettes">
                {filterPalettes(palettes.palettes, search).map(palette => <li key={palette.id}>
                  <button type="button" className="palette-option" data-palette-choice={palette.id} aria-pressed={chosen === palette.id} disabled={blocked}
                    onClick={() => { setChosen(palette.id); setMessage(''); }}>
                    <span className="palette-name">{palette.name}</span>
                    <span>{chosen === palette.id ? 'Selected' : `${palette.colors.length} colors`}</span>
                    <span className="palette-strip" aria-hidden="true">{palette.colors.slice(0, 4).map(hex => <span key={hex} style={{ backgroundColor: hex }} />)}</span>
                  </button>
                </li>)}
              </ul>
              {!filterPalettes(palettes.palettes, search).length && <p className="color-feedback">No matching palettes.</p>}
              {chosen && <p className="color-feedback">Selected: {palettes.palettes.find(palette => palette.id === chosen)?.name}</p>}
              <div className="palette-form-actions">
                <button type="button" className="palette-primary" disabled={blocked || !chosen} onClick={async () => {
                  if (busy.current || blocked || !chosen) return;
                  busy.current = true; setMessage('');
                  const result = await palettes.addColor(chosen, hex);
                  busy.current = false; restoreFocus();
                  if (result && mounted.current) setMessage(result.alreadySaved ? 'Already saved in this palette' : `Added to ${result.palette.name}`);
                }}>Add color to palette</button>
              </div>
            </div>
          ) : (
            <div className="palette-empty">
              <p>{palettes.loading ? 'Loading palettes…' : palettes.error ? 'Palettes could not be loaded.' : 'No palettes yet. Create one for this color.'}</p>
              <button type="button" className="history-text-button" disabled={blocked} onClick={() => {
                setMode('new'); setMessage(''); modeButtons.current[1]?.focus();
              }}>Switch to New palette</button>
            </div>
          ) : (
            <PaletteCreateForm pending={blocked} placeholder="e.g. Sunday morning" submitLabel="Create & add color" buttonClassName="palette-primary"
              onCreate={async name => {
                setMessage('');
                const result = await palettes.create(name, hex);
                if (result && mounted.current) { setChosen(result.palette.id); setMessage(`Added to ${result.palette.name}`); }
                restoreFocus();
                return !!result;
              }} />
          )}
        </div>
        <p role="status" aria-live="polite" className="color-feedback">{palettes.error}</p>
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="color-feedback">{message}</p>
    </div>
  );
}
