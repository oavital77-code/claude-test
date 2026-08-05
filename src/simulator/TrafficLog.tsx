import { useEffect, useRef } from 'react';
import { useTrafficLog } from './useTrafficLog';
import { useSimSnapshots } from './useSimSnapshots';
import { formatTime } from '../ui/format';

const CHAR_SHORT: Record<string, string> = { liveReading: 'fe81', config: 'fe82', deviceInfo: 'fe83' };

export function TrafficLog() {
  const entries = useTrafficLog();
  const snapshots = useSimSnapshots();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries.length]);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">לוג תעבורה</h3>
      <div
        ref={scrollRef}
        className="h-56 overflow-y-auto rounded-lg border border-coal-700 bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-slate-300"
        dir="ltr"
      >
        {entries.length === 0 && <div className="p-2 text-slate-600">ממתין לתעבורה…</div>}
        {entries.map((e) => {
          const name = snapshots.find((s) => s.deviceId === e.deviceId)?.name ?? e.deviceId;
          return (
            <div key={e.id} className="whitespace-nowrap">
              <span className="text-slate-500">{formatTime(e.timestamp)}</span>{' '}
              <span className={e.direction === 'in' ? 'text-brand-400' : 'text-warn'}>
                {e.direction === 'in' ? '←' : '→'}
              </span>{' '}
              <span className="text-slate-400">{e.kind.padEnd(6)}</span>{' '}
              <span className="text-slate-500">{CHAR_SHORT[e.characteristic]}</span>{' '}
              <span>{e.hex}</span>{' '}
              <span className="text-slate-600">// {name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
