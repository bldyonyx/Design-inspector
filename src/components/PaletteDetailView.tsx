import { Check, Copy, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { useSavedPalettes } from '../hooks/useSavedPalettes';
import type { SavedPalette } from '../storage/savedPalettes';
import { copyText } from '../utils/color';
import { PaletteCreateForm } from './PaletteCreateForm';

function PaletteColorRow({ hex, disabled, onSelect, onRemove, announce }: {
  hex: string; disabled: boolean; onSelect: () => void; onRemove: () => void; announce: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const copyButton = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(timer.current); }; }, []);
  return <li className="history-row palette-color-row">
    <button type="button" className="history-select" disabled={disabled} aria-label={`Inspect color ${hex}`} onClick={onSelect}>
      <span className="color-swatch" aria-hidden="true" style={{ backgroundColor: hex }} /><span className="history-hex">{hex}</span>
    </button>
    <button type="button" ref={copyButton} className="copy-color" aria-label={`Copy HEX ${hex}`} disabled={copying} onClick={async () => {
      if (busy.current) return;
      busy.current = true; setCopying(true); setCopied(false); clearTimeout(timer.current); announce('');
      try { await copyText(hex); if (mounted.current) { setCopied(true); announce(`Copied ${hex}.`); timer.current = setTimeout(() => setCopied(false), 2000); } }
      catch { if (mounted.current) announce('Could not copy. Select the HEX value and copy manually.'); }
      finally { busy.current = false; if (mounted.current) { setCopying(false); requestAnimationFrame(() => { if (document.activeElement === document.body) copyButton.current?.focus(); }); } }
    }}>{copied ? <Check className="copy-icon" aria-hidden="true" /> : <Copy className="copy-icon" aria-hidden="true" />}</button>
    <button type="button" className="copy-color" aria-label={`Remove color ${hex}`} disabled={disabled} onClick={onRemove}><Trash2 aria-hidden="true" className="copy-icon" /></button>
  </li>;
}

export function PaletteDetailView({ palette, palettes, onBack, onDeleted, onSelect }: {
  palette: SavedPalette; palettes: ReturnType<typeof useSavedPalettes>; onBack: () => void; onDeleted: () => void; onSelect: (hex: string) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const renameButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [undo, setUndo] = useState<{ hex: string; index: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  const mounted = useRef(true);
  const blocked = palettes.pending || palettes.loading;
  useEffect(() => {
    mounted.current = true; heading.current?.focus(); window.scrollTo(0, 0);
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);
  useEffect(() => { if (confirming) cancelDelete.current?.focus(); }, [confirming]);
  const focusHeading = () => requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  return <section className="history-view" aria-labelledby="palette-heading">
    <button type="button" className="secondary-action" disabled={blocked} onClick={onBack}>Back to collections</button>
    <h2 id="palette-heading" tabIndex={-1} ref={heading} className="inspector-heading font-editorial palette-name">{palette.name}</h2>
    <p className="archive-count">{palette.colors.length} colors</p>
    <div className="palette-management-actions">
      <button type="button" ref={renameButton} className="secondary-action" disabled={blocked || confirming} onClick={() => { setMessage(''); setRenaming(true); }}>Rename palette</button>
      <button type="button" ref={deleteButton} className="secondary-action" disabled={blocked || renaming || confirming} onClick={() => { setMessage(''); setConfirming(true); }}>Delete palette</button>
    </div>
    {renaming && <div><PaletteCreateForm key={palette.id} initialName={palette.name} autoFocus pending={blocked} submitLabel="Save name" buttonClassName="palette-primary" onCreate={async name => {
      setMessage(''); const result = await palettes.rename(palette.id, name);
      if (result && mounted.current) { setRenaming(false); setMessage('Palette renamed.'); requestAnimationFrame(() => renameButton.current?.focus()); }
      if (!result && mounted.current) requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.palette-create input')?.focus());
      return !!result;
    }} /><button type="button" className="secondary-action" disabled={blocked} onClick={() => { setRenaming(false); requestAnimationFrame(() => renameButton.current?.focus()); }}>Cancel rename</button></div>}
    {confirming && <div className="history-confirm" role="group" aria-labelledby="palette-delete-question">
      <p id="palette-delete-question">Delete this palette and its saved color associations? Color history will remain untouched.</p>
      <div className="palette-management-actions">
        <button type="button" ref={cancelDelete} className="secondary-action" disabled={blocked} onClick={() => { setConfirming(false); requestAnimationFrame(() => deleteButton.current?.focus()); }}>Cancel deletion</button>
        <button type="button" className="palette-primary" disabled={blocked} onClick={async () => {
          if (busy.current) return; busy.current = true; setMessage('');
          const result = await palettes.deletePalette(palette.id); busy.current = false;
          if (result) onDeleted();
          else requestAnimationFrame(() => cancelDelete.current?.focus());
        }}>Yes, delete palette</button>
      </div>
    </div>}
    <p role="status" className="color-feedback">{message}</p>
    <p role="status" className="color-feedback">{palettes.error}</p>
    {undo && <button type="button" className="secondary-action" disabled={blocked} onClick={async () => {
      if (busy.current) return; busy.current = true; setMessage('');
      const result = await palettes.restoreColor(palette.id, undo.hex, undo.index); busy.current = false;
      if (result && mounted.current) { clearTimeout(timer.current); setUndo(null); setMessage('Color restored.'); }
      if (mounted.current) focusHeading();
    }}>Undo removal of {undo.hex}</button>}
    {palette.colors.length ? <ul className="history-list">{palette.colors.map((hex, index) => <PaletteColorRow key={hex} hex={hex}
      disabled={blocked || confirming || renaming} onSelect={() => onSelect(hex)} announce={setMessage} onRemove={async () => {
        if (busy.current || blocked) return; busy.current = true; setMessage('');
        const result = await palettes.removeColor(palette.id, hex); busy.current = false;
        if (result && mounted.current) { clearTimeout(timer.current); setUndo({ hex, index }); setMessage(`Removed ${hex}.`); focusHeading(); timer.current = setTimeout(() => setUndo(null), 5000); }
        if (!result && mounted.current) focusHeading();
      }} />)}</ul> : <div className="archive-empty"><p>No colors saved yet. Add colors from the inspector.</p><div aria-hidden="true" className="archive-dots" /></div>}
  </section>;
}
