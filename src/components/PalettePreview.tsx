import { ChevronRight } from 'lucide-react';
import type { SavedPalette } from '../storage/savedPalettes';
export function PalettePreview({ palette, onOpen }: { palette: SavedPalette; onOpen: (id: string) => void }) {
  return <button type="button" className="palette-preview" data-palette-id={palette.id} onClick={() => onOpen(palette.id)}>
    <span className="palette-name">{palette.name}</span>
    <span className="palette-preview-meta"><span className="archive-count">{palette.colors.length} colors</span><ChevronRight aria-hidden="true" className="copy-icon" /></span>
    <span className="palette-strip" aria-hidden="true">{palette.colors.slice(0, 5).map(hex => <span key={hex} style={{ backgroundColor: hex }} />)}</span>
  </button>;
}
