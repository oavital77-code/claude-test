import { Battery, BatteryLow, BatteryWarning } from 'lucide-react';
import { LtrNum } from './LtrNum';

export function BatteryIndicator({ batteryPct }: { batteryPct: number | null }) {
  if (batteryPct === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <Battery size={14} />
        <LtrNum>—</LtrNum>
      </span>
    );
  }
  const Icon = batteryPct < 15 ? BatteryWarning : batteryPct < 30 ? BatteryLow : Battery;
  const color = batteryPct < 15 ? 'text-alarm' : batteryPct < 30 ? 'text-warn' : 'text-slate-400';
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${color}`}>
      <Icon size={14} />
      <LtrNum>{Math.round(batteryPct)}%</LtrNum>
    </span>
  );
}
