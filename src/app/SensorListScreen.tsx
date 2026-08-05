import { Plus } from 'lucide-react';
import { useSensors } from '../domain/SensorContext';
import { Button } from '../ui/primitives';
import { AlertBanner } from './AlertBanner';
import { SensorCard } from './SensorCard';
import { useRouter } from './router';

const MAX_SENSORS = 5;

export function SensorListScreen() {
  const sensors = useSensors();
  const { navigate } = useRouter();

  return (
    <div className="flex flex-col gap-5">
      <AlertBanner />

      {sensors.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-coal-600 py-16 text-center text-slate-400">
          <p>אין עדיין חיישנים מחוברים</p>
          <Button onClick={() => navigate({ screen: 'add' })}>
            <Plus size={16} />
            חיבור חיישן ראשון
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sensors.map((sensor) => (
            <SensorCard key={sensor.deviceId} sensor={sensor} />
          ))}
          {sensors.length < MAX_SENSORS && (
            <button
              onClick={() => navigate({ screen: 'add' })}
              className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-coal-600 text-slate-400 transition-colors hover:border-brand-500 hover:text-brand-400"
            >
              <Plus size={28} />
              <span className="text-sm">הוסף חיישן</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
