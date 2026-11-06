import { useEffect, useRef, useState } from 'react';
import { palettesRepository, type SavedPalette } from '../storage/savedPalettes';

type Result = Awaited<ReturnType<typeof palettesRepository.create>>;
export function useSavedPalettes() {
  const [palettes, setPalettes] = useState<SavedPalette[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void palettesRepository.load().then(result => {
      if (active) {
        setPalettes(result.palettes);
        setError(result.malformed ? 'Some damaged palette data was skipped.' : '');
      }
    }).catch(() => { if (active) setError('Palettes could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; mounted.current = false; };
  }, []);
  const run = async (operation: () => Promise<Result>) => {
    setPending(count => count + 1);
    try {
      const result = await operation();
      if (mounted.current) {
        setPalettes(result.palettes);
        setError(result.malformed ? 'Some damaged palette data was skipped.' : '');
      }
      return result;
    } catch {
      if (mounted.current) setError('Palette could not be saved. Please try again.');
      return null;
    } finally { if (mounted.current) setPending(count => count - 1); }
  };
  return { palettes, loading, pending: pending > 0, error,
    create: (name: string, color?: string) => run(() => palettesRepository.create(name, color)),
    rename: (id: string, name: string) => run(() => palettesRepository.rename(id, name)),
    removeColor: (id: string, hex: string) => run(() => palettesRepository.removeColor(id, hex)),
    restoreColor: (id: string, hex: string, index: number) => run(() => palettesRepository.restoreColor(id, hex, index)),
    deletePalette: (id: string) => run(() => palettesRepository.delete(id)),
    addColor: (id: string, color: string) => run(() => palettesRepository.addColor(id, color)) };
}
