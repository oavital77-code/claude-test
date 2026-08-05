import { useEffect, useState } from 'react';
import { transport, type SimDeviceSnapshot } from '../transport';

const POLL_MS = 250;

export function useSimSnapshots(): SimDeviceSnapshot[] {
  const [snapshots, setSnapshots] = useState<SimDeviceSnapshot[]>(() => transport.listSnapshots());

  useEffect(() => {
    const id = setInterval(() => setSnapshots(transport.listSnapshots()), POLL_MS);
    return () => clearInterval(id);
  }, []);

  return snapshots;
}
