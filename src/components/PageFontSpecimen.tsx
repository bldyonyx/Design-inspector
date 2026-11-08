import { useEffect, useRef } from 'react';
import { paintRaster, type SpecimenRaster } from '../font/specimenSession';

export function PageFontSpecimen({ raster, label = 'Fixed specimen rendered with page fonts', onError }: {
  raster: SpecimenRaster; label?: string; onError?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    try { if (element) paintRaster(element, raster); }
    catch { onError?.(); }
    return () => { if (element) { element.width = 0; element.height = 0; } };
  }, [raster, onError]);
  return <canvas ref={canvas} className="font-page-specimen" width={480} height={144} role="img" aria-label={label} />;
}
