import { ArrowRight, Bell, Home, ShieldCheck } from 'lucide-react';
import { useSensors } from '../domain/SensorContext';
import { activeAlertTypes } from '../domain/alertEngine';
import { useRouter } from './router';
import { SensorListScreen } from './SensorListScreen';
import { SensorDetailScreen } from './SensorDetailScreen';
import { SettingsScreen } from './SettingsScreen';
import { AlertsLogScreen } from './AlertsLogScreen';
import { AddSensorScreen } from './AddSensorScreen';

export function AppShell() {
  const { route, navigate } = useRouter();
  const sensors = useSensors();
  const activeAlertCount = sensors.filter((s) => activeAlertTypes(s.alertState).length > 0).length;

  const showBack = route.screen !== 'home';

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-coal-700 bg-coal-900/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          {showBack ? (
            <button
              onClick={() => navigate({ screen: 'home' })}
              className="rounded-lg p-2 text-slate-400 hover:bg-coal-800 hover:text-slate-200"
              aria-label="חזרה"
            >
              <ArrowRight size={18} />
            </button>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
              <ShieldCheck size={20} />
            </div>
          )}
          <div>
            <div className="text-lg font-bold tracking-wide text-slate-50">VOLTSAFE</div>
            <div className="-mt-1 text-[11px] text-slate-500">ניטור התחממות יתר</div>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          <NavButton
            active={route.screen === 'home'}
            icon={<Home size={16} />}
            label="בית"
            onClick={() => navigate({ screen: 'home' })}
          />
          <NavButton
            active={route.screen === 'alerts'}
            icon={<Bell size={16} />}
            label="יומן התראות"
            badge={activeAlertCount || undefined}
            onClick={() => navigate({ screen: 'alerts' })}
          />
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        {route.screen === 'home' && <SensorListScreen />}
        {route.screen === 'sensor' && <SensorDetailScreen deviceId={route.id} />}
        {route.screen === 'settings' && <SettingsScreen deviceId={route.id} />}
        {route.screen === 'alerts' && <AlertsLogScreen />}
        {route.screen === 'add' && <AddSensorScreen />}
      </main>
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? 'bg-brand-500/15 text-brand-400' : 'text-slate-400 hover:bg-coal-800 hover:text-slate-200'
      }`}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className="absolute -top-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-alarm px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
