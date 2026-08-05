import { useEffect, useRef, useState } from 'react';
import { transport, type TrafficLogEntry } from '../transport';

const MAX_ENTRIES = 300;

export function useTrafficLog(): TrafficLogEntry[] {
  const [entries, setEntries] = useState<TrafficLogEntry[]>([]);
  const bufferRef = useRef<TrafficLogEntry[]>([]);

  useEffect(() => {
    const unsub = transport.onTraffic((entry) => {
      bufferRef.current = [...bufferRef.current, entry].slice(-MAX_ENTRIES);
    });
    const flush = setInterval(() => setEntries(bufferRef.current), 200);
    return () => {
      unsub();
      clearInterval(flush);
    };
  }, []);

  return entries;
}
