import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import type { HistoryPoint } from '../domain/types';

export function MiniGraph({
  history,
  windowMs,
  strokeClassName = 'stroke-brand-400',
}: {
  history: HistoryPoint[];
  windowMs: number;
  strokeClassName?: string;
}) {
  const cutoff = Date.now() - windowMs;
  const points = history.filter((p) => p.timestampMs >= cutoff || history[history.length - 1] === p);
  const data = points.length > 1 ? points : history.slice(-2);

  if (data.length < 2) {
    return <div className="flex h-12 items-center text-xs text-slate-600">אין עדיין מספיק נתונים</div>;
  }

  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
          <Line
            type="monotone"
            dataKey="temperatureC"
            className={strokeClassName}
            stroke="currentColor"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
