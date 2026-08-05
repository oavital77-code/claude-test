import { useState } from 'react';
import { Gauge } from 'lucide-react';
import { transport } from '../transport';

const SPEEDS = [1, 10, 60] as const;

export function SpeedControl() {
  const [speed, setSpeed] = useState<1 | 10 | 60>(1);

  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        <Gauge size={14} />
        מהירות זמן
      </span>
      <div className="flex gap-1 rounded-lg bg-coal-800 p-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setSpeed(s);
              transport.setSpeed(s);
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-mono transition-colors ${
              speed === s ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
