import { useEffect, useId, useRef, useState } from 'react';
import type { useSavedPalettes } from '../hooks/useSavedPalettes';
import { filterPalettes } from '../utils/paletteSearch';
import { PalettePreview } from './PalettePreview';
export function CollectionsView({ palettes, onOpen, onBack, message }: {
  palettes: ReturnType<typeof useSavedPalettes>; onOpen: (id: string) => void; onBack: () => void; message: string;
}) {
  const [search, setSearch] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0); }, []);
  const matches = filterPalettes(palettes.palettes, search);
  return <section className="history-view" aria-labelledby="collections-page-heading">
    <button type="button" className="secondary-action" onClick={onBack}>Back to inspector</button>
    <h2 id="collections-page-heading" ref={heading} tabIndex={-1} className="inspector-heading font-editorial">your collections.</h2>
    <p className="archive-count">{palettes.palettes.length} palettes</p>
    <label htmlFor={id}>Search collections</label>
    <input id={id} type="search" className="palette-search" value={search} onChange={event => setSearch(event.target.value)} />
    {matches.length ? <ul className="palette-list">{matches.map(palette => <li key={palette.id}><PalettePreview palette={palette} onOpen={onOpen} /></li>)}</ul>
      : <div className="archive-empty"><p>{palettes.loading ? 'Loading palettes…' : search.trim() ? 'No matching palettes.' : 'No palettes saved yet.'}</p><div aria-hidden="true" className="archive-dots" /></div>}
    <p role="status" className="color-feedback">{message}</p>
    <p role="status" className="color-feedback">{palettes.error}</p>
  </section>;
}
