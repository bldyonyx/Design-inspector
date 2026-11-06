import { Check, ChevronDown, Copy } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { closestColorName } from '../utils/colorName';
import { copyText, formatHsl, formatRgb, hexToRgb, rgbToHsl, type ColorFormat } from '../utils/color';

export function ColorDetails({ hex, disabled }: { hex: string; disabled: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const detailsId = useId();
  const colorName = closestColorName(hex);
  const rgb = hexToRgb(hex);
  const values: Record<ColorFormat, string> = { HEX: hex, RGB: formatRgb(rgb), HSL: formatHsl(rgbToHsl(rgb)) };
  const [copied, setCopied] = useState<Partial<Record<ColorFormat, boolean>>>({});
  const [pending, setPending] = useState<Partial<Record<ColorFormat, boolean>>>({});
  const [message, setMessage] = useState('');
  const timers = useRef<Partial<Record<ColorFormat, ReturnType<typeof setTimeout>>>>({});
  const busy = useRef(new Set<ColorFormat>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const activeTimers = timers.current;
    return () => {
      mounted.current = false;
      Object.values(activeTimers).forEach(clearTimeout);
    };
  }, []);

  const copy = async (format: ColorFormat) => {
    if (disabled || busy.current.has(format)) return;
    busy.current.add(format);
    clearTimeout(timers.current[format]);
    setCopied(previous => ({ ...previous, [format]: false }));
    setPending(previous => ({ ...previous, [format]: true }));
    setMessage('');
    try {
      await copyText(values[format]);
      if (mounted.current) {
        setCopied(previous => ({ ...previous, [format]: true }));
        setMessage(`${format} copied!`);
        timers.current[format] = setTimeout(() => {
          delete timers.current[format];
          setCopied(previous => ({ ...previous, [format]: false }));
        }, 2000);
      }
    } catch {
      if (mounted.current) setMessage(`Could not copy ${format}. Select the value and copy it manually.`);
    } finally {
      busy.current.delete(format);
      if (mounted.current) setPending(previous => ({ ...previous, [format]: false }));
    }
  };

  return (
    <section className="color-details" aria-label="Selected color">
      <button type="button" className="color-result color-summary"
        aria-expanded={expanded} aria-controls={detailsId}
        aria-label={`Color details for ${hex}, closest color name ${colorName.name}`}
        onClick={() => setExpanded(previous => !previous)}>
        <span aria-hidden="true" className="color-swatch" style={{ backgroundColor: hex }} />
        <span className="color-name-copy">
          <span className="color-name-label">CLOSEST COLOR NAME</span>
          <span>{colorName.name}</span>
        </span>
        <ChevronDown aria-hidden="true" className={`color-chevron${expanded ? ' is-expanded' : ''}`} />
      </button>
      <div id={detailsId} hidden={!expanded}>
        <dl className="color-values">
          {(Object.keys(values) as ColorFormat[]).map(format => (
            <div className="color-value-row" key={format}>
              <dt>{format}</dt>
              <dd>{values[format]}</dd>
              <button type="button" className="copy-color" aria-label={`Copy ${format} value`}
                disabled={disabled || pending[format]} onClick={() => copy(format)}>
                {copied[format] ? <Check aria-hidden="true" className="copy-icon" /> : <Copy aria-hidden="true" className="copy-icon" />}
              </button>
            </div>
          ))}
        </dl>
        <p role="status" aria-live="polite" aria-atomic="true" className="color-feedback">{message}</p>
      </div>
    </section>
  );
}
