import { Check, Copy, Pipette, Type } from 'lucide-react';
import { useEyeDropper } from '../hooks/useEyeDropper';
import type { InspectorMode } from './InspectorTabs';

interface InspectorPanelProps {
  mode: InspectorMode;
}

export function InspectorPanel({ mode }: InspectorPanelProps) {
  const color = useEyeDropper();
  const isColors = mode === 'colors';
  const pickDisabled = !color.supported || color.isPicking || color.isCopying;

  return (
    <section
      role="tabpanel"
      id="inspector-panel"
      tabIndex={0}
      aria-labelledby={`tab-${mode}`}
      className="inspector-panel"
    >
      <p className="editorial-label">THE INSPECTOR</p>
      <div className="inspector-panel-row">
        <div>
          <h2 className="inspector-heading font-editorial">
            {isColors ? 'find your color.' : 'find your font.'}
          </h2>
          <p className="inspector-description">
            {isColors
              ? 'Capture any shade from your screen, and make it yours.'
              : 'Discover the fonts and styles behind any webpage.'}
          </p>
        </div>
        {isColors ? (
          <button type="button" className="inspector-icon-button" aria-label="Pick a color"
            onClick={color.pick} disabled={pickDisabled}>
            <Pipette aria-hidden="true" className="inspector-icon" strokeWidth={1.25} />
          </button>
        ) : (
          <Type aria-hidden="true" className="inspector-icon" strokeWidth={1.25} />
        )}
      </div>

      <button
        type="button"
        disabled={!isColors || pickDisabled}
        onClick={isColors ? color.pick : undefined}
        className="inspector-action"
      >
        <span>{isColors ? (color.isPicking ? 'Picking a color…' : 'Pick a color') : 'Inspect a font'}</span>
        {!isColors && <span>Coming soon</span>}
      </button>
      {isColors && (
        <>
          {!color.supported && (
            <p className="color-feedback">Color picking is not supported in this browser.</p>
          )}
          {color.hex && (
            <div className="color-result">
              <span aria-hidden="true" className="color-swatch" style={{ backgroundColor: color.hex }} />
              <span className="color-hex" aria-label={`HEX color ${color.hex}`}>{color.hex}</span>
              <button type="button" className="copy-hex" onClick={color.copy}
                disabled={color.isPicking || color.isCopying}>
                <span className="copy-hex-content">
                  {color.copied ? <Check aria-hidden="true" className="copy-icon" /> : <Copy aria-hidden="true" className="copy-icon" />}
                  <span>{color.isCopying ? 'Copying…' : color.copied ? 'Copied!' : 'Copy HEX'}</span>
                </span>
              </button>
            </div>
          )}
          <p role="status" aria-live="polite" aria-atomic="true" className="color-feedback">{color.message}</p>
        </>
      )}
    </section>
  );
}
