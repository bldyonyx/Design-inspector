import { useEffect, useRef, useState } from 'react';
import { inspectFont } from '../font/inspectFont';
import type { FontResult } from '../font/types';

export function FontInspectionTest() {
  const [result, setResult] = useState<FontResult | null>(null);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <section className="font-test" aria-label="Font inspection prototype">
    <p className="editorial-label">DEVELOPMENT TEST</p>
    <p className="color-feedback">Inspects the first suitable heading or paragraph in the toolbar-selected webpage. Re-click the toolbar icon after navigation or to choose another tab.</p>
    <button type="button" ref={button} className="secondary-action" disabled={pending} onClick={async () => {
      if (busy.current) return;
      busy.current = true; setPending(true); setError(''); setResult(null); setSource('');
      try {
        const response = await inspectFont();
        if (mounted.current) { setResult(response.fonts); setSource(response.source); }
      } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : 'Font inspection is unavailable.'); }
      finally {
        busy.current = false;
        if (mounted.current) { setPending(false); requestAnimationFrame(() => { if (document.activeElement === document.body) button.current?.focus(); }); }
      }
    }}>{pending ? 'Inspecting…' : 'Test font inspection'}</button>
    <p role="status" aria-live="polite" className="color-feedback">{error || (result ? `Font properties received from ${source}.` : '')}</p>
    {result && <dl className="font-test-results">{Object.entries(result).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>}
  </section>;
}
