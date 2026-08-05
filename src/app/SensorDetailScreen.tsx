import { useMemo, useState } from 'react';
import { Settings2 } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSensor } from '../domain/SensorContext';
import { mostSevereActiveAlert, ALERT_SEVERITY, type AlertEvent } from '../domain/alertEngine';
import { TIME_RANGE_MS, type TimeRange } from '../domain/types';
import { AlertBadge } from '../ui/AlertBadge';
import { BatteryIndicator } from '../ui/BatteryIndicator';
import { SignalBars } from '../ui/SignalBars';
import { Button, Card } from '../ui/primitives';
import { formatDuration, formatTemp, formatTime } from '../ui/format';
import { LtrNum } from '../ui/LtrNum';
import { CONN_LABELS, SEVERITY_COLORS } from '../ui/alertPresentation';
import { useRouter } from './router';

const RANGE_LABELS: Record<TimeRange, string> = { '1h': 'שעה', '24h': '24 שעות', '7d': '7 ימים' };

export function SensorDetailScreen({ deviceId }: { deviceId: string }) {
  const sensor = useSensor(deviceId);
  const { navigate } = useRouter();
  const [range, setRange] = useState<TimeRange>('1h');

  if (!sensor) {
    return <div className="text-slate-400">החיישן לא נמצא.</div>;
  }

  const alertType = mostSevereActiveAlert(sensor.alertState);
  const isConnected = sensor.connState === 'connected';

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-50">{sensor.meta.nickname || sensor.hardwareName}</h1>
            {sensor.meta.locationLabel && <p className="mt-0.5 text-sm text-slate-400">{sensor.meta.locationLabel}</p>}
            <div className="mt-3 flex items-center gap-4">
              <SignalBars rssi={sensor.rssi} />
              <BatteryIndicator batteryPct={sensor.batteryPct} />
              <span className="text-xs text-slate-500">{CONN_LABELS[sensor.connState]}</span>
            </div>
          </div>
          <Button variant="secondary" onClick={() => navigate({ screen: 'settings', id: deviceId })}>
            <Settings2 size={16} />
            הגדרות
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-8">
          <div>
            <div className="text-xs text-slate-500">טמפרטורה</div>
            <div className="ltr-num text-6xl font-bold tabular-nums text-slate-50" dir="ltr">
              {isConnected ? formatTemp(sensor.temperatureC) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">לחות</div>
            <div className="ltr-num text-2xl font-semibold text-slate-200" dir="ltr">
              {sensor.humidityPct !== null && isConnected ? `${sensor.humidityPct.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div className="flex-1" />
          {alertType && <AlertBadge type={alertType} />}
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">היסטוריית טמפרטורה</h2>
          <div className="flex gap-1 rounded-lg bg-coal-800 p-1">
            {(['1h', '24h', '7d'] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1 text-xs transition-colors ${
                  range === r ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
        <HistoryChart sensor={sensor} range={range} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">אירועים אחרונים</h2>
        <EventsTable events={sensor.alertState.events} />
      </Card>
    </div>
  );
}

function HistoryChart({
  sensor,
  range,
}: {
  sensor: NonNullable<ReturnType<typeof useSensor>>;
  range: TimeRange;
}) {
  const cutoff = Date.now() - TIME_RANGE_MS[range];
  const data = useMemo(
    () =>
      sensor.history
        .filter((p) => p.timestampMs >= cutoff)
        .map((p) => ({ t: p.timestampMs, temp: Number(p.temperatureC.toFixed(1)) })),
    [sensor.history, cutoff],
  );

  const shadedRegions = sensor.alertState.events.filter(
    (e) => (e.type === 'ALARM_HIGH' || e.type === 'ALARM_LOW' || e.type === 'ALARM_ROR') && e.openedAtMs >= cutoff,
  );

  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500">
        אין עדיין מספיק נתונים בטווח הנבחר
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c2b3a" />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatTime}
            stroke="#5b6b7c"
            fontSize={11}
            minTickGap={40}
          />
          <YAxis stroke="#5b6b7c" fontSize={11} domain={['dataMin - 3', 'dataMax + 3']} />
          <Tooltip
            contentStyle={{ background: '#141f2b', border: '1px solid #27384a', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(t) => formatTime(Number(t))}
            formatter={(v: number) => [`${v}°C`, 'טמפ׳']}
          />
          {shadedRegions.map((e) => (
            <ReferenceArea
              key={e.id}
              x1={e.openedAtMs}
              x2={e.closedAtMs ?? Date.now()}
              fill="#e5484d"
              fillOpacity={0.12}
              stroke="none"
            />
          ))}
          {sensor.config.highThresholdEnabled && (
            <ReferenceLine
              y={sensor.config.highThresholdC}
              stroke="#e5484d"
              strokeDasharray="4 4"
              label={{ value: 'סף עליון', position: 'insideTopRight', fill: '#e5484d', fontSize: 11 }}
            />
          )}
          {sensor.config.lowThresholdEnabled && (
            <ReferenceLine
              y={sensor.config.lowThresholdC}
              stroke="#5b8ff5"
              strokeDasharray="4 4"
              label={{ value: 'סף תחתון', position: 'insideBottomRight', fill: '#5b8ff5', fontSize: 11 }}
            />
          )}
          <Line type="monotone" dataKey="temp" stroke="#5b8ff5" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EventsTable({ events }: { events: AlertEvent[] }) {
  const rows = [...events].sort((a, b) => b.openedAtMs - a.openedAtMs).slice(0, 20);

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">לא נרשמו אירועים עדיין.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-coal-700 text-start text-xs text-slate-500">
            <th className="py-2 text-start font-normal">סוג</th>
            <th className="py-2 text-start font-normal">נפתח</th>
            <th className="py-2 text-start font-normal">נסגר</th>
            <th className="py-2 text-start font-normal">משך</th>
            <th className="py-2 text-start font-normal">טמפ׳ שיא</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-b border-coal-800 last:border-0">
              <td className="py-2">
                <AlertBadge type={e.type} />
              </td>
              <td className="py-2 text-slate-300">
                <LtrNum>{formatTime(e.openedAtMs)}</LtrNum>
              </td>
              <td className="py-2 text-slate-300">
                {e.closedAtMs ? (
                  <LtrNum>{formatTime(e.closedAtMs)}</LtrNum>
                ) : (
                  <span className={SEVERITY_COLORS[ALERT_SEVERITY[e.type]].text}>פעיל</span>
                )}
              </td>
              <td className="py-2 text-slate-300">
                <LtrNum>{formatDuration((e.closedAtMs ?? Date.now()) - e.openedAtMs)}</LtrNum>
              </td>
              <td className="py-2 text-slate-300">
                {e.extremeTemperatureC !== null ? <LtrNum>{formatTemp(e.extremeTemperatureC)}</LtrNum> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
