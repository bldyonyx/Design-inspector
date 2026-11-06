// Self-contained function serialized by executeScript into the isolated main
// frame. No imports, page code, DOM writes, text values, or form values are used.
export function inspectPageFont() {
  const candidates = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p');
  for (let i = 0; i < Math.min(candidates.length, 500); i++) {
    const element = candidates[i];
    if (element.closest('form,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"]')) continue;
    if (![...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE)) continue;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || style.visibility !== 'visible' || style.display === 'none') continue;
    return { pageUrl: location.href, fonts: {
      fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
      lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
    } };
  }
  return null;
}
