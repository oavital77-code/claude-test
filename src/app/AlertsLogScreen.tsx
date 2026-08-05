import { useMemo, useState } from 'react';
import { useSensorContext, useSensors } from '../domain/SensorContext';
import type { AlertType } from '../domain/alertEngine';
import { ALERT_SEVERITY } from '../domain/alertEngine';
import { AlertBadge } from '../ui/AlertBadge';
import { Card } from '../ui/primitives';
import { formatDateTime, formatDuration, formatTemp } from '../ui/format';
import { LtrNum } from '../ui/LtrNum';
import { ALERT_LABELS, SEVERITY_COLORS } from '../ui/alertPresentation';
import { useRouter } from './router';

const ALL_TYPES: AlertType[] = ['ALARM_HIGH', 'ALARM_ROR', 'ALARM_LOW', 'LINK_LOST', 'SENSOR_FAULT', 'LOW_BATTERY'];

export function AlertsLogScreen() {
  const { allAlertEvents } = useSensorContext();
  const sensors = useSensors();
  const { navigate } = useRouter();

  const [sensorFilter, setSensorFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filtered = useMemo(
    () =>
      allAlertEvents.filter(
        (row) =>
          (sensorFilter === 'all' || row.deviceId === sensorFilter) &&
          (typeFilter === 'all' || row.event.type === typeFilter),
      ),
    [allAlertEvents, sensorFilter, typeFilter],
  );

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-bold text-slate-100">יומן התראות</h1>

      <div className="flex flex-wrap gap-3">
        <select
          value={sensorFilter}
          onChange={(e) => setSensorFilter(e.target.value)}
          className="rounded-lg border border-coal-600 bg-coal-800 px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">כל החיישנים</option>
          {sensors.map((s) => (
            <option key={s.deviceId} value={s.deviceId}>
              {s.meta.nickname || s.hardwareName}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-coal-600 bg-coal-800 px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">כל הסוגים</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>
              {ALERT_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">אין אירועים תואמים.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-coal-700 text-xs text-slate-500">
                  <th className="px-4 py-3 text-start font-normal">זמן</th>
                  <th className="px-4 py-3 text-start font-normal">חיישן</th>
                  <th className="px-4 py-3 text-start font-normal">סוג</th>
                  <th className="px-4 py-3 text-start font-normal">טמפ׳ שיא</th>
                  <th className="px-4 py-3 text-start font-normal">משך</th>
                  <th className="px-4 py-3 text-start font-normal">סגירה</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ deviceId, event }) => {
                  const sensor = sensors.find((s) => s.deviceId === deviceId);
                  return (
                    <tr
                      key={`${deviceId}-${event.id}`}
                      className="cursor-pointer border-b border-coal-800 last:border-0 hover:bg-coal-800/50"
                      onClick={() => navigate({ screen: 'sensor', id: deviceId })}
                    >
                      <td className="px-4 py-3 text-slate-300">
                        <LtrNum>{formatDateTime(event.openedAtMs)}</LtrNum>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{sensor?.meta.nickname || sensor?.hardwareName || deviceId}</td>
                      <td className="px-4 py-3">
                        <AlertBadge type={event.type} />
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {event.extremeTemperatureC !== null ? <LtrNum>{formatTemp(event.extremeTemperatureC)}</LtrNum> : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <LtrNum>{formatDuration((event.closedAtMs ?? Date.now()) - event.openedAtMs)}</LtrNum>
                      </td>
                      <td className="px-4 py-3">
                        {event.closedAtMs ? (
                          <span className="text-slate-400">
                            <LtrNum>{formatDateTime(event.closedAtMs)}</LtrNum>
                          </span>
                        ) : (
                          <span className={`font-medium ${SEVERITY_COLORS[ALERT_SEVERITY[event.type]].text}`}>פעיל</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
