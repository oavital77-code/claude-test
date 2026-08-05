import { Plug, PlugZap, Wrench } from 'lucide-react';
import { transport, type SimDeviceSnapshot } from '../transport';
import { SCENARIO_LABELS, type ScenarioId } from '../transport/scenarios';
import { Slider, Toggle } from '../ui/primitives';
import { LtrNum } from '../ui/LtrNum';

const SCENARIOS: ScenarioId[] = ['stable', 'slow_heat', 'sharp_fault', 'cooling', 'battery_drain'];

export function SensorControlCard({ snapshot }: { snapshot: SimDeviceSnapshot }) {
  const connected = snapshot.connState === 'connected';

  return (
    <div className="rounded-xl border border-coal-700 bg-coal-800/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-100">{snapshot.name}</div>
          <div className="ltr-num text-[11px] text-slate-500" dir="ltr">
            {snapshot.deviceId}
          </div>
        </div>
        <button
          onClick={() => transport.setRadioConnected(snapshot.deviceId, !connected)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
            connected ? 'bg-ok/15 text-ok' : 'bg-coal-700 text-slate-400'
          }`}
          title="מתג חיבור"
        >
          {connected ? <PlugZap size={13} /> : <Plug size={13} />}
          {connected ? 'מחובר' : 'מנותק'}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <Slider
          label="טמפרטורה"
          unit="°C"
          min={-40}
          max={105}
          step={0.1}
          value={snapshot.temperatureC}
          onChange={(v) => transport.setTemperature(snapshot.deviceId, v)}
        />
        <Slider
          label="לחות"
          unit="%"
          min={0}
          max={100}
          step={1}
          value={snapshot.humidityPct}
          onChange={(v) => transport.setHumidity(snapshot.deviceId, v)}
        />
        <Slider
          label="סוללה"
          unit="%"
          min={0}
          max={100}
          step={1}
          value={snapshot.batteryPct}
          onChange={(v) => transport.setBattery(snapshot.deviceId, v)}
        />

        <Toggle
          label="דגל תקלה"
          checked={snapshot.fault}
          onChange={(v) => transport.setFault(snapshot.deviceId, v)}
        />

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-400">
            <Wrench size={12} />
            תרחישים אוטומטיים
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SCENARIOS.map((sc) => (
              <button
                key={sc}
                onClick={() => transport.runScenario(snapshot.deviceId, sc)}
                className={`rounded-lg px-2.5 py-1 text-[11px] transition-colors ${
                  snapshot.scenario === sc
                    ? 'bg-brand-500 text-white'
                    : 'bg-coal-700 text-slate-300 hover:bg-coal-600'
                }`}
              >
                {SCENARIO_LABELS[sc]}
              </button>
            ))}
            {snapshot.scenario && (
              <button
                onClick={() => transport.stopScenario(snapshot.deviceId)}
                className="rounded-lg bg-coal-900 px-2.5 py-1 text-[11px] text-slate-400 hover:text-slate-200"
              >
                עצירה
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>
            רצף: <LtrNum>{snapshot.config.sampleRateSeconds}s</LtrNum>
          </span>
          <span>
            סוללה: <LtrNum>{Math.round(snapshot.batteryPct)}%</LtrNum>
          </span>
        </div>
      </div>
    </div>
  );
}
