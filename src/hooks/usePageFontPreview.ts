import { useCallback, useEffect, useRef, useState } from 'react';
import { requestSpecimen, specimenApi, type SpecimenRaster } from '../font/specimenSession';
import type { SelectionSession } from '../font/selectionSession';
import type { FontResult } from '../font/types';

export function usePageFontPreview(enabled: boolean) {
  const [phase, setPhase] = useState<'approximate' | 'generating' | 'available' | 'unavailable'>('approximate');
  const [raster, setRaster] = useState<SpecimenRaster | null>(null);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const stop = useCallback(() => {
    generation.current++;
    pending.current?.abort(); pending.current = null;
  }, []);
  const reset = useCallback(() => {
    stop(); setRaster(null); setPhase('approximate');
  }, [stop]);
  const unavailable = useCallback(() => {
    stop(); setRaster(null); setPhase('unavailable');
  }, [stop]);
  useEffect(() => {
    const hide = () => reset();
    window.addEventListener('pagehide', hide);
    return () => { reset(); window.removeEventListener('pagehide', hide); };
  }, [enabled, reset, stop]);
  const generate = async (selection: SelectionSession, fonts: FontResult) => {
    if (!enabled || pending.current) return;
    stop(); const operation = generation.current;
    const controller = new AbortController(); pending.current = controller;
    setRaster(null); setPhase('generating');
    try {
      const result = await requestSpecimen(specimenApi(), selection.target, fonts, controller.signal);
      if (generation.current !== operation || controller.signal.aborted) return;
      setRaster(result); setPhase('available');
    } catch {
      // Never log browser replies or raster data. Keep the safe local preview.
      if (generation.current === operation) { setRaster(null); setPhase('unavailable'); }
    } finally { if (generation.current === operation) pending.current = null; }
  };
  return { phase, raster, generate, reset, unavailable };
}
