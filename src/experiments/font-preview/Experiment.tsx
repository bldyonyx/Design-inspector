import { useEffect, useRef, useState } from 'react';
import { PageFontSpecimen as Raster } from '../../components/PageFontSpecimen';
import { FontPreview } from '../../components/FontPreview';
import { useFontSelection } from '../../hooks/useFontSelection';
import { selectionApi } from '../../font/selectionSession';
import { readTarget } from '../../font/targetTab';
import type { TargetTab } from '../../font/browserApi';
import { renderSpecimen } from '../../font/renderSpecimen';
import { requestSpecimen, specimenApi, validateRaster, type SpecimenRaster } from '../../font/specimenSession';

export function Experiment() {
  const font = useFontSelection(true);
  const [target, setTarget] = useState<TargetTab | null>(null);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [rasters, setRasters] = useState<{ page: SpecimenRaster; extension: SpecimenRaster } | null>(null);
  const cancel = () => { generation.current++; pending.current?.abort(); pending.current = null; setRasters(null); setBusy(false); };
  useEffect(() => {
    const clear = () => { generation.current++; pending.current?.abort(); pending.current = null; };
    window.addEventListener('pagehide', clear);
    return () => { clear(); window.removeEventListener('pagehide', clear); };
  }, []);
  return <main style={{ padding: 20, maxWidth: 600, margin: 'auto' }}>
    <h1>Page font specimen experiment</h1>
    <p>Fixed sample text only. Drawing may cause the browser to request unused font subsets. No screenshots or font downloads by extension code.</p>
    <button type="button" className="secondary-action" disabled={font.phase !== 'idle'} onClick={async () => {
      cancel(); const operation = generation.current; setMessage(''); setTarget(null);
      try {
        const captured = await readTarget(selectionApi());
        if (generation.current !== operation) return;
        setTarget(captured); await font.start();
      }
      catch { if (generation.current === operation) setMessage('Open this experiment from the target webpage toolbar icon.'); }
    }}>Select typography</button>
    <button type="button" className="secondary-action" onClick={() => { cancel(); font.cancel(); setMessage('Experiment cancelled.'); }}>Cancel experiment</button>
    <p role="status">{font.message} {message}</p>
    {font.fonts && <>
      <h2>Current extension preview</h2>
      <FontPreview fonts={font.fonts} active={false} />
      <button type="button" className="secondary-action" disabled={busy || font.phase !== 'idle' || !target} onClick={async () => {
        cancel(); const operation = generation.current; const controller = new AbortController(); pending.current = controller;
        setBusy(true); setMessage('Rendering fixed specimen…');
        try {
          const page = await requestSpecimen(specimenApi(), target!, font.fonts!, controller.signal);
          const requestId = crypto.randomUUID();
          const extension = validateRaster(renderSpecimen({ requestId, pageUrl: location.href, fonts: font.fonts! }), requestId, location.href);
          if (generation.current !== operation || controller.signal.aborted) return;
          setRasters({ page, extension }); setMessage(`Raster comparison ready. Stretch applied: ${page.stretchApplied}; letter spacing applied: ${page.spacingApplied}.`);
        } catch (error) {
          if (generation.current === operation) setMessage(error instanceof Error ? error.message : 'Experiment failed.');
        } finally { if (generation.current === operation) { setBusy(false); pending.current = null; } }
      }}>Render comparison</button>
    </>}
    {rasters && <>
      <h2>Experimental page canvas</h2><Raster raster={rasters.page} label="Page-rendered fixed specimen" />
      <h2>Extension canvas control</h2><Raster raster={rasters.extension} label="Extension-rendered fixed specimen" />
      <p>Both canvases use the same drawing code. They do not identify the font used by the selected glyphs. Long lines may be clipped; axes, features, and optical sizing are not reproduced.</p>
    </>}
  </main>;
}
