import { useFontSelection } from '../hooks/useFontSelection';
import { FontInspectionTest } from './FontInspectionTest';
import { PalettePicker } from './PalettePicker';
import type { useSavedPalettes } from '../hooks/useSavedPalettes';
import { Pipette, Type } from 'lucide-react';
import { ColorDetails } from './ColorDetails';
import type { useEyeDropper } from '../hooks/useEyeDropper';
import type { InspectorMode } from './InspectorTabs';

interface InspectorPanelProps {
  mode: InspectorMode;
  palettes: ReturnType<typeof useSavedPalettes>;
  color: ReturnType<typeof useEyeDropper>;
}

export function InspectorPanel({ mode, color, palettes }: InspectorPanelProps) {
  const isColors = mode === 'colors';
  const font = useFontSelection(!isColors);
  const pickDisabled = !color.supported || color.isPicking;

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
        disabled={isColors ? pickDisabled : font.phase !== 'idle'}
        onClick={isColors ? color.pick : font.start}
        className="inspector-action"
      >
        <span>{isColors ? (color.isPicking ? 'Picking a color…' : 'Pick a color') : font.phase === 'idle' ? 'Inspect a font' : font.phase === 'starting' ? 'Starting inspection…' : 'Inspection active…'}</span>

      </button>
      {!isColors && <>
        {font.phase !== 'idle' && <button type="button" className="secondary-action" onClick={font.cancel}>Cancel font inspection</button>}
        <p role="status" aria-live="polite" className="color-feedback">{font.message}</p>
        {font.fonts && <dl className="font-test-results" aria-label="Selected typography">{Object.entries(font.fonts).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>}
        <details className="font-development"><summary>Development prototype (non-interactive)</summary><FontInspectionTest /></details>
      </>}
      {isColors && (
        <>
          {!color.supported && (
            <p className="color-feedback">Color picking is not supported in this browser.</p>
          )}
          {color.hex && (
            <div key={color.selectionId}>
              <ColorDetails hex={color.hex} disabled={color.isPicking} />
              <PalettePicker hex={color.hex} palettes={palettes} disabled={color.isPicking} />
            </div>
          )}
          <p role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">{color.selectionAnnouncement}</p>
          <p role="status" aria-live="polite" aria-atomic="true" className="color-feedback">{color.message}</p>
        </>
      )}
    </section>
  );
}
