import { Pipette, Type } from 'lucide-react';
import type { InspectorMode } from './InspectorTabs';

interface InspectorPanelProps {
  mode: InspectorMode;
}

export function InspectorPanel({ mode }: InspectorPanelProps) {
  const isColors = mode === 'colors';
  const Icon = isColors ? Pipette : Type;

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
        <Icon
          aria-hidden="true"
          className="inspector-icon"
          strokeWidth={1.25}
        />
      </div>

      <button
        type="button"
        disabled
        aria-disabled="true"
        className="inspector-action"
      >
        <span>{isColors ? 'Pick a color' : 'Inspect a font'}</span>
        <span>Coming soon</span>
      </button>
    </section>
  );
}
