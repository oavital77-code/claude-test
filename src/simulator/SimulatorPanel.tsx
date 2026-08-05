import { Cpu } from 'lucide-react';
import { useSimSnapshots } from './useSimSnapshots';
import { SensorControlCard } from './SensorControlCard';
import { SpeedControl } from './SpeedControl';
import { TrafficLog } from './TrafficLog';

export function SimulatorPanel() {
  const snapshots = useSimSnapshots();

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-s border-coal-700 bg-coal-950">
      <div className="border-b border-coal-700 px-4 py-4">
        <div className="flex items-center gap-2 text-amber-400">
          <Cpu size={18} />
          <span className="text-sm font-bold tracking-wide">סימולטור חומרה</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          חומרה מדומה — כאן שולטים ידנית על החיישנים. האפליקציה משמאל לעולם לא יודעת שזו לא חומרה אמיתית.
        </p>
        <div className="mt-3">
          <SpeedControl />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3">
          {snapshots.map((s) => (
            <SensorControlCard key={s.deviceId} snapshot={s} />
          ))}
        </div>
      </div>

      <div className="border-t border-coal-700 px-4 py-4">
        <TrafficLog />
      </div>
    </aside>
  );
}
