import { AlertTriangle } from 'lucide-react';
import { activeAlertTypes, mostSevereActiveAlert, ALERT_SEVERITY } from '../domain/alertEngine';
import { useSensors } from '../domain/SensorContext';
import { ALERT_LABELS, SEVERITY_COLORS } from '../ui/alertPresentation';
import { useRouter } from './router';

export function AlertBanner() {
  const sensors = useSensors();
  const { navigate } = useRouter();

  const alerting = sensors
    .map((s) => ({ sensor: s, type: mostSevereActiveAlert(s.alertState) }))
    .filter((x): x is { sensor: (typeof sensors)[number]; type: NonNullable<typeof x.type> } => x.type !== null);

  if (alerting.length === 0) return null;

  const worst = [...alerting].sort((a, b) => rank(ALERT_SEVERITY[b.type]) - rank(ALERT_SEVERITY[a.type]))[0];
  const colors = SEVERITY_COLORS[ALERT_SEVERITY[worst.type]];

  return (
    <button
      onClick={() => navigate({ screen: 'sensor', id: worst.sensor.deviceId })}
      className={`flex w-full items-center gap-3 rounded-xl border ${colors.border}/40 ${colors.bg} px-4 py-3 text-start`}
    >
      <AlertTriangle className={colors.text} size={20} />
      <div className="flex-1">
        <div className={`text-sm font-semibold ${colors.text}`}>
          {alerting.length === 1
            ? `${ALERT_LABELS[worst.type]} — ${worst.sensor.meta.nickname || worst.sensor.hardwareName}`
            : `${alerting.length} חיישנים במצב התראה`}
        </div>
        {alerting.length > 1 && (
          <div className="mt-0.5 text-xs text-slate-400">
            {alerting.map((a) => a.sensor.meta.nickname || a.sensor.hardwareName).join(' · ')}
          </div>
        )}
      </div>
    </button>
  );
}

function rank(sev: 'critical' | 'warning' | 'info'): number {
  return sev === 'critical' ? 3 : sev === 'warning' ? 2 : 1;
}

export function hasAnyActiveAlert(sensors: ReturnType<typeof useSensors>): boolean {
  return sensors.some((s) => activeAlertTypes(s.alertState).length > 0);
}
