import { ArrowLeft, Check, Copy, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { useColorHistory } from '../hooks/useColorHistory';
import type { HistoryEntry } from '../storage/colorHistory';
import { copyText } from '../utils/color';

type History = ReturnType<typeof useColorHistory>;

function HistoryRow({ entry, disabled, onSelect, onDelete, announce }: {
  entry: HistoryEntry; disabled: boolean; onSelect: () => void; onDelete: () => void; announce: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);
  const copy = async () => {
    if (busy.current) return;
    busy.current = true;
    clearTimeout(timer.current);
    setCopied(false);
    setCopying(true);
    announce('');
    try {
      await copyText(entry.hex);
      if (mounted.current) {
        setCopied(true);
        announce(`Copied ${entry.hex}.`);
        timer.current = setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      if (mounted.current) announce('Could not copy. Select the HEX value and copy it manually.');
    } finally {
      busy.current = false;
      if (mounted.current) setCopying(false);
    }
  };
  return (
    <li className="history-row">
      <button type="button" className="history-select" aria-label={`Inspect color ${entry.hex}`}
        disabled={disabled} onClick={onSelect}>
        <span aria-hidden="true" className="color-swatch" style={{ backgroundColor: entry.hex }} />
        <span className="history-hex">{entry.hex}</span>
      </button>
      <button type="button" className="copy-color" aria-label={`Copy HEX ${entry.hex}`} disabled={copying} onClick={copy}>
        {copied ? <Check aria-hidden="true" className="copy-icon" /> : <Copy aria-hidden="true" className="copy-icon" />}
      </button>
      <button type="button" className="copy-color" aria-label={`Delete color ${entry.hex}`} disabled={disabled} onClick={onDelete}>
        <Trash2 aria-hidden="true" className="copy-icon" />
      </button>
    </li>
  );
}

export function ColorHistoryView({ history, onBack, onSelect }: { history: History; onBack: () => void; onSelect: (hex: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const [undo, setUndo] = useState<HistoryEntry | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const working = useRef(false);
  const mounted = useRef(true);
  const unavailable = history.loading || history.pending;

  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    window.scrollTo(0, 0);
    return () => { mounted.current = false; clearTimeout(undoTimer.current); };
  }, []);
  useEffect(() => { if (confirming) cancelButton.current?.focus(); }, [confirming]);

  const remove = async (hex: string) => {
    if (working.current || unavailable) return;
    working.current = true;
    setMessage('');
    const result = await history.remove(hex);
    working.current = false;
    if (!mounted.current) return;
    if (result) {
      clearTimeout(undoTimer.current);
      setUndo(result.removed ?? null);
      setMessage(`Deleted ${hex}.`);
      heading.current?.focus({ preventScroll: true });
      undoTimer.current = setTimeout(() => setUndo(null), 5000);
    }
  };
  const restore = async () => {
    if (!undo || working.current || unavailable) return;
    working.current = true;
    setMessage('');
    const result = await history.restore(undo);
    working.current = false;
    if (result && mounted.current) {
      clearTimeout(undoTimer.current);
      setUndo(null);
      setMessage('Color restored.');
      heading.current?.focus({ preventScroll: true });
    }
  };
  const clear = async () => {
    if (!confirming || working.current || unavailable) return;
    working.current = true;
    setMessage('');
    const result = await history.clear();
    working.current = false;
    if (result && mounted.current) {
      clearTimeout(undoTimer.current);
      setUndo(null);
      setConfirming(false);
      setMessage('History cleared.');
      heading.current?.focus({ preventScroll: true });
    }
  };

  return (
    <section className="history-view" aria-labelledby="history-heading">
      <button type="button" className="history-text-button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" className="copy-icon" /> Back to inspector
      </button>
      <h2 id="history-heading" tabIndex={-1} ref={heading} className="inspector-heading font-editorial">all collected colors.</h2>
      <div className="history-toolbar">
        <span className="archive-count">{history.entries.length} colors</span>
        {history.entries.length > 0 && <button type="button" className="history-text-button" ref={clearButton}
          disabled={unavailable || confirming} onClick={() => { setMessage(''); setConfirming(true); }}>Clear history</button>}
      </div>
      {confirming && (
        <div className="history-confirm" role="group" aria-labelledby="clear-question">
          <p id="clear-question">Clear all collected colors? This cannot be undone.</p>
          <div className="history-confirm-actions">
            <button type="button" className="history-text-button" ref={cancelButton} disabled={unavailable}
              onClick={() => { setConfirming(false); requestAnimationFrame(() => clearButton.current?.focus()); }}>Cancel</button>
            <button type="button" className="history-text-button" disabled={unavailable} onClick={clear}>Yes, clear history</button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" aria-atomic="true" className="color-feedback">{message}</p>
      {undo && <button type="button" className="history-text-button" disabled={unavailable} onClick={restore}>Undo deletion of {undo.hex}</button>}
      <p role="status" aria-live="polite" className="color-feedback">{history.error}</p>
      {history.entries.length ? (
        <ul className="history-list">
          {history.entries.map(entry => <HistoryRow key={entry.hex} entry={entry} disabled={unavailable || confirming}
            onSelect={() => onSelect(entry.hex)} onDelete={() => remove(entry.hex)} announce={setMessage} />)}
        </ul>
      ) : (
        <div className="archive-empty"><p>{history.loading ? 'Loading colors…' : history.error ? 'History unavailable.' : 'Nothing collected yet.'}</p>
          <div aria-hidden="true" className="archive-dots" /></div>
      )}
    </section>
  );
}
