import type { FontResult } from '../font/types';
import { previewStyle } from '../font/previewStyle';
import { PageFontSpecimen } from './PageFontSpecimen';
import type { useFontSelection } from '../hooks/useFontSelection';
import { useEffect, useRef } from 'react';

const properties = [
  ['fontFamily', 'CSS font family'], ['fontSize', 'Font size'],
  ['fontWeight', 'Font weight'], ['fontStyle', 'Font style'],
  ['fontStretch', 'Font stretch'], ['lineHeight', 'Line height'],
  ['letterSpacing', 'Letter spacing'], ['fontVariationSettings', 'Variation settings'],
  ['fontFeatureSettings', 'Feature settings'], ['fontOpticalSizing', 'Optical sizing'],
] as const;

export function FontPreview({ fonts, active, pagePreview }: {
  fonts: FontResult | null; active: boolean;
  pagePreview?: ReturnType<typeof useFontSelection>['pagePreview'];
}) {
  const action = useRef<HTMLButtonElement>(null);
  const wasGenerating = useRef(false);
  useEffect(() => {
    const generating = pagePreview?.phase === 'generating';
    if (wasGenerating.current && !generating && document.activeElement === document.body) action.current?.focus();
    wasGenerating.current = generating;
  }, [pagePreview?.phase]);
  if (!fonts) return <div className="font-preview font-preview-empty">
    <p className="font-specimen font-editorial" aria-hidden="true">Aa Bb Cc</p>
    <p className="font-preview-note">{active ? 'Choose text on your webpage.' : 'A closer look at your next typeface.'}</p>
  </div>;

  return <div className="font-result">
    <section className="font-preview" aria-label="Font preview">
      {pagePreview?.raster ? <PageFontSpecimen raster={pagePreview.raster} onError={pagePreview.unavailable} /> : <>
      <p className="font-specimen" style={previewStyle(fonts)}>Aa Bb Cc</p>
      <p className="font-sentence" style={previewStyle(fonts, false)}>The quick brown fox jumps over the lazy dog.</p>
      </>}
      <p className="font-preview-note" role="status" aria-live="polite">
        {pagePreview && ({ approximate: 'Approximate preview. ', generating: 'Generating page preview. ', available: 'Page-font preview available. ', unavailable: 'Page preview unavailable. ' }[pagePreview.phase])}
        {!pagePreview?.raster && 'Preview may use a fallback font.'}
      </p>
      {pagePreview && <>
        <div className="font-preview-actions">
          {pagePreview.raster ? <button ref={action} type="button" className="secondary-action" onClick={pagePreview.reset}>Use approximate preview</button> :
            <button ref={action} type="button" className="secondary-action" disabled={active || pagePreview.phase === 'generating'} onClick={pagePreview.generate} aria-describedby="page-font-preview-note">Preview with page fonts</button>}
          {pagePreview.phase === 'generating' && <button type="button" className="secondary-action" onClick={pagePreview.reset}>Cancel page preview</button>}
        </div>
        <p className="font-preview-note" id="page-font-preview-note">May cause the browser to load additional font subsets.</p>
      </>}
    </section>
    <details className="font-details" key={JSON.stringify(fonts)}>
      <summary>Font details</summary>
      <dl className="font-test-results" aria-label="Selected typography">
        {properties.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{fonts[key] || 'Unavailable'}</dd></div>)}
      </dl>
    </details>
  </div>;
}
