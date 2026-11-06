import { useEffect, useRef, useState } from 'react';
import { colorHistoryRepository, mergeHistory, type HistoryEntry } from '../storage/colorHistory';
import { normalizeHex } from '../utils/color';

type HistoryResult = { entries: HistoryEntry[]; malformed: boolean; removed?: HistoryEntry };

export function useColorHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const lastCapture = useRef(0);
  const revision = useRef(0);
  const optimistic = useRef<{ revision: number; entry: HistoryEntry }[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const load = colorHistoryRepository.load();
    queue.current = load.catch(() => undefined);
    void load.then(result => {
      if (!active) return;
      setEntries(mergeHistory(result.entries, optimistic.current.map(item => item.entry)));
      setError(result.malformed ? 'Some damaged history entries could not be loaded.' : '');
    }).catch(() => {
      if (active) setError('History could not be loaded. Color picking still works.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; mounted.current = false; };
  }, []);

  const run = (id: number, operation: () => Promise<HistoryResult>, failure: string) => {
    setPending(count => count + 1);
    const task = queue.current.then(operation).then(result => {
      // A committed operation includes all earlier unsaved captures. Keep only
      // newer optimistic captures, never merge a stale snapshot after deletion.
      optimistic.current = optimistic.current.filter(item => item.revision > id);
      if (mounted.current) {
        setEntries(mergeHistory(result.entries, optimistic.current.map(item => item.entry)));
        setError(result.malformed ? 'Some damaged history entries were skipped.' : '');
      }
      return result;
    }).catch(() => {
      if (mounted.current) setError(failure);
      return null;
    }).finally(() => { if (mounted.current) setPending(count => count - 1); });
    queue.current = task;
    return task;
  };

  const capture = (value: string) => {
    const hex = normalizeHex(value);
    const capturedAt = Math.max(Date.now(), lastCapture.current + 1);
    lastCapture.current = capturedAt;
    const entry = { hex, capturedAt };
    const id = ++revision.current;
    optimistic.current = [{ revision: id, entry }, ...optimistic.current.filter(item => item.entry.hex !== hex)].slice(0, 100);
    setEntries(previous => mergeHistory([entry], previous));
    void run(id, () => colorHistoryRepository.capture(entry), 'History could not be saved. Recent colors may be lost when this window closes.');
  };
  const remove = (hex: string) => run(++revision.current, () => colorHistoryRepository.remove(hex), 'Color could not be deleted. History was not changed.');
  const clear = () => run(++revision.current, () => colorHistoryRepository.clear(), 'History could not be cleared. History was not changed.');
  const restore = (entry: HistoryEntry) => run(++revision.current, () => colorHistoryRepository.restore(entry), 'Color could not be restored. Please try again.');

  return { entries, loading, pending: pending > 0, error, capture, remove, clear, restore };
}
