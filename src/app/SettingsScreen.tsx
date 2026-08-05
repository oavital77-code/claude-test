import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import type { SensorConfig } from '../protocol';
import { useSensor, useSensorContext } from '../domain/SensorContext';
import { Button, Card, NumberField, TextField, Toggle } from '../ui/primitives';
import { useRouter } from './router';

export function SettingsScreen({ deviceId }: { deviceId: string }) {
  const sensor = useSensor(deviceId);
  const { updateMeta, writeConfig, removeSensor } = useSensorContext();
  const { navigate } = useRouter();

  const [nickname, setNickname] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [config, setConfig] = useState<SensorConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!sensor) return;
    setNickname(sensor.meta.nickname);
    setLocationLabel(sensor.meta.locationLabel);
    setConfig(sensor.config);
    // Only seed the form once when the sensor first becomes available —
    // after that, local edits should not be clobbered by live updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensor?.deviceId]);

  if (!sensor || !config) {
    return <div className="text-slate-400">החיישן לא נמצא.</div>;
  }

  const isValid = config.highThresholdC > config.lowThresholdC;

  async function handleSave() {
    if (!config || !sensor) return;
    setError(null);
    if (!isValid) {
      setError('הסף העליון חייב להיות גבוה מהסף התחתון');
      return;
    }
    setSaving(true);
    try {
      updateMeta(deviceId, { nickname, locationLabel });
      await writeConfig(deviceId, config);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הכתיבה לחיישן נכשלה');
      setConfig(sensor.config); // revert to last known-good value from the device
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    await removeSensor(deviceId);
    navigate({ screen: 'home' });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">זיהוי</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="שם החיישן" value={nickname} onChange={setNickname} placeholder="חיישן 1" />
          <TextField label="תווית מיקום" value={locationLabel} onChange={setLocationLabel} placeholder="לוח ראשי — קומה 2" />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          השם והתווית נשמרים באפליקציה בלבד ואינם נכתבים לחומרה.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">סף עליון</h2>
        <div className="flex flex-col gap-4">
          <Toggle
            label="סף עליון פעיל"
            checked={config.highThresholdEnabled}
            onChange={(v) => setConfig({ ...config, highThresholdEnabled: v })}
          />
          <NumberField
            label="סף עליון"
            unit="°C"
            value={config.highThresholdC}
            min={-40}
            max={105}
            step={0.1}
            disabled={!config.highThresholdEnabled}
            onChange={(v) => setConfig({ ...config, highThresholdC: v })}
          />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">קצב עלייה (Rate of Rise)</h2>
        <div className="flex flex-col gap-4">
          <Toggle
            label="התראת קצב עלייה פעילה"
            checked={config.rorEnabled}
            onChange={(v) => setConfig({ ...config, rorEnabled: v })}
          />
          <NumberField
            label="סף קצב עלייה"
            unit="°C לדקה"
            value={config.rorThresholdCPerMin}
            min={1}
            max={25}
            step={0.1}
            disabled={!config.rorEnabled}
            onChange={(v) => setConfig({ ...config, rorThresholdCPerMin: v })}
          />
          <NumberField
            label="חלון קצב עלייה"
            unit="דקות"
            value={config.rorWindowMinutes}
            min={1}
            max={15}
            step={1}
            disabled={!config.rorEnabled}
            onChange={(v) => setConfig({ ...config, rorWindowMinutes: v })}
          />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">סף תחתון</h2>
        <div className="flex flex-col gap-4">
          <Toggle
            label="סף תחתון פעיל"
            checked={config.lowThresholdEnabled}
            onChange={(v) => setConfig({ ...config, lowThresholdEnabled: v })}
          />
          <NumberField
            label="סף תחתון"
            unit="°C"
            value={config.lowThresholdC}
            min={-40}
            max={105}
            step={0.1}
            disabled={!config.lowThresholdEnabled}
            onChange={(v) => setConfig({ ...config, lowThresholdC: v })}
          />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">דגימה</h2>
        <NumberField
          label="קצב דגימה"
          unit="שניות"
          value={config.sampleRateSeconds}
          min={1}
          max={60}
          step={1}
          onChange={(v) => setConfig({ ...config, sampleRateSeconds: v })}
        />
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-alarm/40 bg-alarm/10 px-4 py-3 text-sm text-alarm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {savedAt && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
          <CheckCircle2 size={16} />
          ההגדרות נכתבו לחיישן בהצלחה
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="danger" onClick={handleRemove}>
          <Trash2 size={16} />
          הסרת חיישן
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'שומר…' : 'שמירה'}
        </Button>
      </div>
    </div>
  );
}
