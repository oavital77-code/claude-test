import { MapPin, WifiOff } from 'lucide-react';
import type { SensorRuntime } from '../domain/types';
import { mostSevereActiveAlert, ALERT_SEVERITY } from '../domain/alertEngine';
import { AlertBadge } from '../ui/AlertBadge';
import { BatteryIndicator } from '../ui/BatteryIndicator';
import { SignalBars } from '../ui/SignalBars';
import { MiniGraph } from '../ui/MiniGraph';
import { formatTemp } from '../ui/format';
import { LtrNum } from '../ui/LtrNum';
import { CONN_LABELS, SEVERITY_COLORS } from '../ui/alertPresentation';
import { Card } from '../ui/primitives';
import { useRouter } from './router';

export function SensorCard({ sensor }: { sensor: SensorRuntime }) {
  const { navigate } = useRouter();
  const alertType = mostSevereActiveAlert(sensor.alertState);
  const isDisconnected = sensor.connState !== 'connected';
  const borderClass = alertType
    ? `${SEVERITY_COLORS[ALERT_SEVERITY[alertType]].border} border-2`
    : 'border-coal-700';

  return (
    <Card
      className={`cursor-pointer p-5 transition-transform hover:-translate-y-0.5 ${borderClass}`}
      onClick={() => navigate({ screen: 'sensor', id: sensor.deviceId })}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-slate-100">
            {sensor.meta.nickname || sensor.hardwareName}
          </div>
          {sensor.meta.locationLabel && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
              <MapPin size={12} />
              {sensor.meta.locationLabel}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SignalBars rssi={sensor.rssi} />
          <BatteryIndicator batteryPct={sensor.batteryPct} />
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div className="ltr-num text-4xl font-bold tracking-tight text-slate-50" dir="ltr">
          {isDisconnected ? '—' : formatTemp(sensor.temperatureC)}
        </div>
        {isDisconnected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-coal-700 px-2.5 py-1 text-xs text-slate-400">
            <WifiOff size={13} />
            {CONN_LABELS[sensor.connState]}
          </span>
        ) : alertType ? (
          <AlertBadge type={alertType} />
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-xs text-ok">
            תקין
          </span>
        )}
      </div>

      <div className="mt-3">
        <MiniGraph
          history={sensor.history}
          windowMs={30 * 60 * 1000}
          strokeClassName={alertType ? SEVERITY_COLORS[ALERT_SEVERITY[alertType]].text : 'text-brand-400'}
        />
      </div>

      {sensor.humidityPct !== null && (
        <div className="mt-2 text-xs text-slate-500">
          לחות: <LtrNum>{Math.round(sensor.humidityPct)}%</LtrNum>
        </div>
      )}
    </Card>
  );
}
