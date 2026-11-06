// Offline, deterministic generator: node scripts/curateColorNames.mjs
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const raw = fs.readFileSync(new URL('../data/color-names/xkcd-rgb.txt', import.meta.url), 'utf8');
const anchors = JSON.parse(fs.readFileSync(new URL('../data/color-names/project-anchors.json', import.meta.url)));
const unsuitable = /\b(shit|poop|poo|puke|vomit|piss|barf|diarrhea|booger|snot|bile|ugly|nasty|gross|icky|boring|weird|sick|sickly)\b/;
const omitted = new Set([
  'liliac', 'kelley green', 'darkgreen', 'darkblue', 'lightblue', 'lightgreen',
  'orangeish', 'orangish', 'terracota', 'burnt siena', 'light lavendar', 'perrywinkle',
  'light urple', 'forrest green', 'ocre', 'aqua marine', 'golden rod', 'egg shell',
  'bluegrey', 'greyblue', 'greenblue', 'bluegreen', 'yellowgreen', 'orangered',
  'burple', 'blurple', 'purply', 'purpley', 'purpleish', 'purplish',
  'bluish', 'reddish', 'greenish', 'yellowish', 'brownish', 'pinkish', 'pinky',
  'blue blue', 'royal', 'dark', 'pale', 'bland', 'nice blue',
  'tiffany blue', 'barbie pink', 'barney', 'barney purple', 'kermit green',
]);
const rename = name => name.replace(/grey/g, 'gray').replaceAll('/', ' ').replace(/\s+/g, ' ').trim()
  .replace(/\b[a-z]/g, letter => letter.toUpperCase());
const entries = anchors.map(entry => ({ ...entry, source: 'project' }));
const names = new Set(entries.map(entry => entry.name.toLowerCase()));
const hexes = new Set(entries.map(entry => entry.hex));
const decisions = [];
for (const line of raw.split(/\r?\n/).filter(line => line && !line.startsWith('#'))) {
  const match = line.match(/^(.+?)\t(#[a-f0-9]{6})\s*$/i);
  if (!match) throw Error(`Invalid source row: ${line}`);
  const [, originalName, sourceHex] = match;
  const name = rename(originalName), hex = sourceHex.toUpperCase();
  let reason;
  if (unsuitable.test(originalName)) reason = 'unsuitable wording';
  else if (omitted.has(originalName)) reason = 'spelling duplicate, vague label, or unsuitable branded label';
  else if (hexes.has(hex)) reason = 'HEX already represented';
  else if (names.has(name.toLowerCase())) reason = 'normalized name already represented';
  if (reason) { decisions.push({ originalName, hex, action: 'omit', reason }); continue; }
  entries.push({ name, hex, source: 'xkcd' }); names.add(name.toLowerCase()); hexes.add(hex);
  decisions.push({ originalName, hex, name, action: 'include' });
}
const catalog = entries.map(({ name, hex }) => ({ name, hex }));
const header = '// Generated catalog v2. See data/color-names/README.md.\n// Regenerate offline: node scripts/curateColorNames.mjs\n';
fs.writeFileSync(new URL('../src/data/colorNames.ts', import.meta.url), header + 'export const colorNames: readonly { readonly name: string; readonly hex: string }[] = ' + JSON.stringify(catalog, null, 2) + ';\n');
fs.writeFileSync(new URL('../data/color-names/curation.json', import.meta.url), JSON.stringify({ version: 2, retrieved: '2026-11-06', source: 'https://xkcd.com/color/rgb.txt', sha256: createHash('sha256').update(raw).digest('hex'), total: entries.length, project: anchors.length, xkcd: entries.length - anchors.length, decisions }, null, 2) + '\n');
console.log({ total: entries.length, project: anchors.length, xkcd: entries.length - anchors.length, omitted: decisions.filter(row => row.action === 'omit').length });
