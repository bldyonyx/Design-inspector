import type { FontResult } from '../font/types';
import { previewStyle } from '../font/previewStyle';

const properties = [
  ['fontFamily', 'CSS font family'], ['fontSize', 'Font size'],
  ['fontWeight', 'Font weight'], ['fontStyle', 'Font style'],
  ['fontStretch', 'Font stretch'], ['lineHeight', 'Line height'],
  ['letterSpacing', 'Letter spacing'], ['fontVariationSettings', 'Variation settings'],
  ['fontFeatureSettings', 'Feature settings'], ['fontOpticalSizing', 'Optical sizing'],
] as const;

export function FontPreview({ fonts, active }: { fonts: FontResult | null; active: boolean }) {
  if (!fonts) return <div className="font-preview font-preview-empty">
    <p className="font-specimen font-editorial" aria-hidden="true">Aa Bb Cc</p>
    <p className="font-preview-note">{active ? 'Choose text on your webpage.' : 'A closer look at your next typeface.'}</p>
  </div>;

  return <div className="font-result">
    <section className="font-preview" aria-label="Font preview">
      <p className="font-specimen" style={previewStyle(fonts)}>Aa Bb Cc</p>
      <p className="font-sentence" style={previewStyle(fonts, false)}>The quick brown fox jumps over the lazy dog.</p>
      <p className="font-preview-note">Preview may use a fallback font.</p>
    </section>
    <details className="font-details" key={JSON.stringify(fonts)}>
      <summary>Font details</summary>
      <dl className="font-test-results" aria-label="Selected typography">
        {properties.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{fonts[key] || 'Unavailable'}</dd></div>)}
      </dl>
    </details>
  </div>;
}
