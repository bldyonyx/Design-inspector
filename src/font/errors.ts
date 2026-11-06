export const fontErrorMessages = {
  NO_TARGET: 'No target tab captured. Click the Design Inspector toolbar icon on the webpage you want to inspect.',
  TARGET_CLOSED: 'The target tab was closed. Open a webpage and click its toolbar icon again.',
  TARGET_NAVIGATED_ORIGIN: 'The target navigated to another origin. Click the toolbar icon on the new page after it finishes loading.',
  TARGET_NAVIGATED: 'The target page navigated. Click its toolbar icon again after navigation finishes.',
  TARGET_LOADING: 'The target page is still loading. Wait for it to finish, then click its toolbar icon again.',
  TARGET_MOVED: 'The target tab moved to another window. Click its toolbar icon again.',
  TARGET_UNAVAILABLE: 'The target page URL is unavailable. Click its toolbar icon again to reselect it.',
  PERMISSION_UNAVAILABLE: 'The browser reports that page access is unavailable. Click its toolbar icon again; check extension site access if this persists.',
  RESTRICTED_PAGE: 'This browser, extension, or protected page cannot be inspected. Choose a normal webpage.',
  INJECTION_FAILED: 'The browser could not inject the font selector. Retry on the target page; this does not necessarily mean a permission problem.',
  CONTROLLER_INIT_FAILED: 'The font selector could not initialize on this page. Retry; if it persists, report the site and the initialization diagnostic.',
  CONTROLLER_LOST: 'The font selector is no longer responding. Retry inspection on the target page.',
  BACKGROUND_MESSAGE_FAILED: 'Could not contact the background worker for the target tab. Reload the extension, then click its toolbar icon again.',
  API_UNAVAILABLE: 'Font inspection APIs are unavailable. Reload the extension and reopen it from the webpage toolbar icon.',
  INTERNAL_ERROR: 'An unexpected font inspection error occurred. Retry; if it persists, check the development diagnostic.',
  CANCELLED: 'Font inspection cancelled.',
} as const;
export type FontErrorCode = keyof typeof fontErrorMessages;
export class FontInspectionError extends Error {
  readonly code: FontErrorCode;
  readonly stage: string;
  readonly diagnostic?: string;
  constructor(code: FontErrorCode, stage: string, diagnostic?: string) {
    super(fontErrorMessages[code] + (code === 'CONTROLLER_INIT_FAILED' && /^[a-z-]{1,40}$/.test(stage) ? ` (Step: ${stage}.)` : '')); this.name = 'FontInspectionError';
    this.code = code; this.stage = stage; this.diagnostic = diagnostic;
  }
}
export function isFontErrorCode(value: unknown): value is FontErrorCode {
  return typeof value === 'string' && Object.hasOwn(fontErrorMessages, value);
}
export function browserFontError(error: unknown, stage: string, fallback: FontErrorCode): FontInspectionError {
  if (error instanceof FontInspectionError) return error;
  const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  let code = fallback;
  if (/No tab with id|Invalid tab ID|tab (?:was |has been )?closed/i.test(detail)) code = 'TARGET_CLOSED';
  else if (/cannot access (?:a )?(?:chrome|opera|edge|chrome-extension):|extensions gallery cannot be scripted|cannot access.*chrome-error:\/\//i.test(detail)) code = 'RESTRICTED_PAGE';
  else if (/extension manifest must request permission|missing host permission|permission (?:was )?(?:denied|revoked)|requires? (?:the )?["']?activeTab/i.test(detail)) code = 'PERMISSION_UNAVAILABLE';
  // Browser errors can include URLs; only a redacted diagnostic may reach DEV logs.
  const redacted = detail.replace(/(?:https?|file|chrome|chrome-extension|opera|edge):[^\s<>"']+/gi, '[redacted-url]').slice(0, 240);
  return new FontInspectionError(code, stage, redacted);
}
export function diagnoseFontError(error: unknown, stage: string): FontInspectionError {
  const fault = browserFontError(error, stage, 'INTERNAL_ERROR');
  if (import.meta.env?.DEV) console.debug('[Design Inspector font]', { code: fault.code, stage: fault.stage, detail: fault.diagnostic });
  return fault;
}
