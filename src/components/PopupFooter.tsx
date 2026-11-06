import { recentPalettes } from '../utils/paletteSearch';
import { PalettePreview } from './PalettePreview';
import { useState } from 'react';
import type { useSavedPalettes } from '../hooks/useSavedPalettes';
import { PaletteCreateForm } from './PaletteCreateForm';

export function PopupFooter({ palettes, onOpen, onViewAll }: { palettes: ReturnType<typeof useSavedPalettes>; onOpen: (id: string) => void; onViewAll: () => void }) {
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <footer className="popup-footer" aria-labelledby="collections-heading">
      <p className="editorial-label footer-label">SAVED COLLECTIONS</p>
      <div className="archive-title-row collections-heading">
        <h2 id="collections-heading" className="archive-heading font-editorial">saved palettes.</h2>
        <button type="button" className="history-text-button" aria-expanded={creating} onClick={() => setCreating(!creating)}>Create palette</button>
      </div>
      {creating && <PaletteCreateForm autoFocus pending={palettes.pending || palettes.loading} onCreate={async name => {
        setMessage('');
        const result = await palettes.create(name);
        if (result) setMessage(`Created ${result.palette.name}.`);
        return !!result;
      }} />}
      {palettes.palettes.length ? <ul className="palette-list">
        {recentPalettes(palettes.palettes).map(palette => <li key={palette.id}><PalettePreview palette={palette} onOpen={onOpen} /></li>)}
      </ul> : <div className="archive-empty"><p>{palettes.loading ? 'Loading palettes…' : palettes.error ? 'Palettes unavailable.' : 'No palettes saved yet.'}</p>
        <div aria-hidden="true" className="archive-dots" /></div>}
      <button id="view-all-collections" type="button" className="secondary-action" onClick={onViewAll}>View all collections</button>
      <p role="status" aria-live="polite" className="color-feedback">{message}</p>
      <p role="status" aria-live="polite" className="color-feedback">{palettes.error}</p>
    </footer>
  );
}
