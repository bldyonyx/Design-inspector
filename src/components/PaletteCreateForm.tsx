import { useId, useRef, useState } from 'react';
import { paletteName } from '../storage/savedPalettes';

export function PaletteCreateForm({ pending, onCreate, initialName = '', autoFocus = false, submitLabel = 'Create palette', placeholder, buttonClassName = 'history-text-button' }: {
  initialName?: string; pending: boolean; onCreate: (name: string) => Promise<boolean>; autoFocus?: boolean; submitLabel?: string; placeholder?: string; buttonClassName?: string;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');
  const id = useId();
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <form className="palette-create" onSubmit={async event => {
      event.preventDefault();
      if (busy.current || pending) return;
      let validName: string;
      try { validName = paletteName(name); }
      catch (error) { setError(error instanceof Error ? error.message : 'Enter a valid name.'); input.current?.focus(); return; }
      setError(''); busy.current = true;
      try { if (await onCreate(validName)) setName(''); }
      finally { busy.current = false; }
    }}>
      <label htmlFor={id}>Palette name</label>
      <div className="palette-form-actions">
        <input type="text" id={id} ref={input} autoFocus={autoFocus} value={name} placeholder={placeholder} maxLength={50} disabled={pending}
          aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
          onChange={event => { setName(event.target.value); setError(''); }} />
        <button type="submit" className={buttonClassName} disabled={pending}>{submitLabel}</button>
      </div>
      <p id={`${id}-error`} role="status" className="color-feedback">{error}</p>
    </form>
  );
}
