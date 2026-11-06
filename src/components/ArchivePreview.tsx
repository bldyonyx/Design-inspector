import type { useColorHistory } from '../hooks/useColorHistory';
import type { InspectorMode } from './InspectorTabs';

interface ArchivePreviewProps {
  mode: InspectorMode;
  history: ReturnType<typeof useColorHistory>;
  onSelect: (hex: string) => void;
  disabled: boolean;
  onViewAll: () => void;
}

export function ArchivePreview({ mode, history, onSelect, disabled, onViewAll }: ArchivePreviewProps) {
  const isColors = mode === 'colors';
  return (
    <section aria-labelledby="archive-heading" className="archive-preview">
      <p className="editorial-label archive-label">YOUR LITTLE ARCHIVE</p>
      <div className="archive-title-row">
        <h2 id="archive-heading" className="archive-heading font-editorial">
          {isColors ? 'collected colors' : 'collected fonts'}
        </h2>
        {isColors && <span className="archive-count">{history.entries.length} colors</span>}
      </div>
      {isColors && history.entries.length > 0 ? (
        <ul className="history-preview" aria-label="Recent colors, newest first">
          {history.entries.slice(0, 5).map(entry => (
            <li key={entry.hex}>
              <button type="button" className="history-swatch" style={{ backgroundColor: entry.hex }}
                aria-label={`Select saved color ${entry.hex}`} title={entry.hex}
                disabled={disabled} onClick={() => onSelect(entry.hex)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="archive-empty">
          <p>{isColors && history.loading ? 'Loading colors…' : isColors && history.error ? 'History unavailable.' : 'Nothing collected yet.'}</p>
          <div aria-hidden="true" className="archive-dots" />
        </div>
      )}
      {isColors && history.entries.length > 0 && <button id="view-all-colors" type="button"
        className="history-text-button view-all-colors" disabled={disabled} onClick={onViewAll}>View all</button>}
      {isColors && <p role="status" aria-live="polite" className="color-feedback">{history.error}</p>}
    </section>
  );
}
