import { useEffect, useRef, useState } from 'react';
import { normalizeHex } from '../utils/color';

interface EyeDropperInstance {
  open(options: { signal: AbortSignal }): Promise<{ sRGBHex: string }>;
}

type EyeDropperWindow = Window & {
  EyeDropper?: new () => EyeDropperInstance;
};

export function useEyeDropper() {
  const supported = typeof (window as EyeDropperWindow).EyeDropper === 'function';
  const [hex, setHex] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [selectionId, setSelectionId] = useState(0);
  const [selectionAnnouncement, setSelectionAnnouncement] = useState('');
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  // Called directly by the click handler; no await precedes open(), preserving
  // the transient user activation required by the native API.
  const pick = async () => {
    if (controller.current) return;
    const EyeDropper = (window as EyeDropperWindow).EyeDropper;
    if (!EyeDropper) {
      setMessage('Color picking is not supported in this browser.');
      return;
    }
    const operation = new AbortController();
    controller.current = operation;
    setIsPicking(true);
    setMessage('');
    setSelectionAnnouncement('');
    try {
      const result = await new EyeDropper().open({ signal: operation.signal });
      const value = normalizeHex(result.sRGBHex);
      if (mounted.current) {
        setSelectionId(id => id + 1);
        setHex(value);
        setSelectionAnnouncement(`Selected ${value}.`);
      }
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof DOMException && error.name === 'AbortError'
          ? 'Selection cancelled.'
          : 'Could not pick a color. Please try again.');
      }
    } finally {
      controller.current = null;
      if (mounted.current) setIsPicking(false);
    }
  };

  return { supported, hex, selectionId, isPicking, message, selectionAnnouncement, pick };
}
