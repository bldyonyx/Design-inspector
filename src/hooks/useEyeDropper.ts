import { useEffect, useRef, useState } from 'react';
import { copyHex, normalizeHex } from '../utils/color';

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
  const [isCopying, setIsCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetConfirmation = () => {
    if (confirmationTimer.current !== null) clearTimeout(confirmationTimer.current);
    confirmationTimer.current = null;
    setCopied(false);
  };
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const copying = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (confirmationTimer.current !== null) clearTimeout(confirmationTimer.current);
    };
  }, []);

  // Called directly by the click handler; no await precedes open(), preserving
  // the transient user activation required by the native API.
  const pick = async () => {
    if (controller.current || copying.current) return;
    const EyeDropper = (window as EyeDropperWindow).EyeDropper;
    if (!EyeDropper) {
      setMessage('Color picking is not supported in this browser.');
      return;
    }
    const operation = new AbortController();
    controller.current = operation;
    setIsPicking(true);
    setMessage('');
    try {
      const result = await new EyeDropper().open({ signal: operation.signal });
      const value = normalizeHex(result.sRGBHex);
      if (mounted.current) {
        resetConfirmation();
        setHex(value);
        setMessage(`Selected ${value}.`);
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

  const copy = async () => {
    if (!hex || copying.current || controller.current) return;
    resetConfirmation();
    copying.current = true;
    setIsCopying(true);
    setMessage('');
    try {
      await copyHex(hex);
      if (mounted.current) {
        setCopied(true);
        setMessage(`Copied ${hex}.`);
        confirmationTimer.current = setTimeout(() => {
          confirmationTimer.current = null;
          setCopied(false);
        }, 2000);
      }
    } catch {
      if (mounted.current) setMessage('Could not copy. Select the HEX value and copy it manually.');
    } finally {
      copying.current = false;
      if (mounted.current) setIsCopying(false);
    }
  };

  return { supported, hex, copied, isPicking, isCopying, message, pick, copy };
}
