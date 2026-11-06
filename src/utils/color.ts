export function normalizeHex(value: string): string {
  if (value.length !== 7 || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Invalid sampled color');
  return value.toUpperCase();
}

export async function copyHex(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(value);
}
