export interface FontResult {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  // Absent on older results or browsers that do not expose the property.
  fontStyle?: string;
  fontStretch?: string;
  fontVariationSettings?: string;
  fontFeatureSettings?: string;
  fontOpticalSizing?: string;
}
export const additionalFontKeys = ['fontStyle', 'fontStretch', 'fontVariationSettings', 'fontFeatureSettings', 'fontOpticalSizing'] as const;
type AdditionalFontKey = typeof additionalFontKeys[number];
const number = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?`;
const tag = String.raw`(?:"[\x20-\x21\x23-\x7e]{4}"|'[\x20-\x26\x28-\x7e]{4}')`;
const variation = new RegExp(`^${tag} ${number}(?:, *${tag} ${number})*$`);
const feature = new RegExp(`^${tag}(?: (?:on|off|\\d+))?(?:, *${tag}(?: (?:on|off|\\d+))?)*$`);

// Validate a small value grammar; never evaluate CSS or accept whole declarations.
export function isAdditionalFontValue(key: AdditionalFontKey, value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 512 || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false;
  switch (key) {
    case 'fontStyle': {
      const match = /^(?:normal|italic|oblique(?: ([+-]?(?:\d+(?:\.\d+)?|\.\d+))deg)?)$/.exec(value);
      return !!match && (match[1] === undefined || Math.abs(Number(match[1])) <= 90);
    }
    case 'fontStretch': return /^(?:normal|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded)$/.test(value)
      || (/^(?:\d+(?:\.\d+)?|\.\d+)%$/.test(value) && Number.isFinite(Number.parseFloat(value)));
    case 'fontVariationSettings': return value === 'normal' || (variation.test(value) && [...value.matchAll(new RegExp(` ${number}(?=,|$)`, 'g'))].every(match => Number.isFinite(Number(match[0]))));
    case 'fontFeatureSettings': return value === 'normal' || feature.test(value);
    case 'fontOpticalSizing': return value === 'auto' || value === 'none';
  }
}

export function validateFontResult(value: unknown): FontResult {
  if (!value || typeof value !== 'object') throw new Error('The page returned an invalid font result.');
  const record = value as Record<string, unknown>;
  const keys = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const;
  for (const key of keys) {
    const field = record[key];
    if (typeof field !== 'string' || !field.trim() || field.length > 512 || [...field].some(character => character.charCodeAt(0) < 32)) {
      throw new Error('The page returned an incomplete font result.');
    }
  }
  if (!/^\d+(?:\.\d+)?px$/.test(record.fontSize as string)
    || !(/^(normal|bold)$/.test(record.fontWeight as string) || (/^\d+(?:\.\d+)?$/.test(record.fontWeight as string) && Number(record.fontWeight) >= 1 && Number(record.fontWeight) <= 1000))
    || !/^(normal|\d+(?:\.\d+)?px)$/.test(record.lineHeight as string)
    || !/^(normal|-?\d+(?:\.\d+)?px)$/.test(record.letterSpacing as string)) {
    throw new Error('The page returned invalid font properties.');
  }
  const result = Object.fromEntries(keys.map(key => [key, record[key]])) as unknown as FontResult;
  for (const key of additionalFontKeys) {
    const field = record[key];
    if (field === undefined || field === '') continue;
    if (!isAdditionalFontValue(key, field)) throw new Error('The page returned invalid font properties.');
    result[key] = field;
  }
  return result;
}
