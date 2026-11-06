import { Check, Copy, Download } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { SavedPalette } from '../storage/savedPalettes';
import { copyText } from '../utils/color';
import { downloadPalette, paletteToCss, type PaletteExportFormat } from '../utils/paletteExport';

export function PaletteExport({ palette, disabled }: { palette: SavedPalette; disabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const busy = useRef(false);
  const copyButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const empty = palette.colors.length === 0;
  const blocked = disabled || empty;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);
  const download = (format: PaletteExportFormat) => {
    if (blocked) return;
    setMessage('');
    try { downloadPalette(palette, format); setMessage(`${format.toUpperCase()} downloaded!`); }
    catch { setMessage('Could not start the download. Please try again.'); }
  };
  return <section className="palette-export" aria-labelledby={id}>
    <h3 id={id} className="editorial-label">Export your palette</h3>
    <button type="button" ref={copyButton} className="palette-primary export-action" disabled={blocked || copying}
      aria-describedby={empty ? `${id}-empty` : undefined} onClick={async () => {
        if (busy.current || blocked) return;
        busy.current = true; setCopying(true); setCopied(false); setMessage(''); clearTimeout(timer.current);
        try {
          await copyText(paletteToCss(palette));
          if (mounted.current) {
            setCopied(true); setMessage('CSS copied!');
            timer.current = setTimeout(() => setCopied(false), 2000);
          }
        } catch { if (mounted.current) setMessage('Could not copy CSS. Please try again.'); }
        finally {
          busy.current = false;
          if (mounted.current) {
            setCopying(false);
            requestAnimationFrame(() => { if (document.activeElement === document.body) copyButton.current?.focus(); });
          }
        }
      }}>
      {copied ? <Check className="copy-icon" aria-hidden="true" /> : <Copy className="copy-icon" aria-hidden="true" />}
      <span>{copying ? 'Copying…' : copied ? 'Copied!' : 'Copy CSS'}</span>
    </button>
    <div className="export-downloads">
      <button type="button" className="secondary-action export-action" disabled={blocked} onClick={() => download('css')}>
        <Download className="copy-icon" aria-hidden="true" /><span>Download CSS</span>
      </button>
      <button type="button" className="secondary-action export-action" disabled={blocked} onClick={() => download('json')}>
        <Download className="copy-icon" aria-hidden="true" /><span>Download JSON</span>
      </button>
    </div>
    {empty && <p id={`${id}-empty`} className="color-feedback">Add a color to this palette to export it.</p>}
    <p role="status" aria-live="polite" aria-atomic="true" className="color-feedback">{message}</p>
  </section>;
}
