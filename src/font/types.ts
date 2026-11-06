export interface FontResult {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
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
  return Object.fromEntries(keys.map(key => [key, record[key]])) as unknown as FontResult;
}
