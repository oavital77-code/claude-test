import { useEffect, useState } from 'react';
import { Bluetooth, Loader2, Plus, RefreshCw } from 'lucide-react';
import type { DiscoveredDevice } from '../transport';
import { useSensorContext, useSensors } from '../domain/SensorContext';
import { Button, Card } from '../ui/primitives';
import { SignalBars } from '../ui/SignalBars';
import { useRouter } from './router';

const MAX_SENSORS = 5;

export function AddSensorScreen() {
  const { scan, addSensor } = useSensorContext();
  const sensors = useSensors();
  const { navigate } = useRouter();

  const [scanning, setScanning] = useState(true);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const atCapacity = sensors.length >= MAX_SENSORS;

  async function runScan() {
    setScanning(true);
    setDevices([]);
    try {
      const found = await scan();
      setDevices(found);
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    if (!atCapacity) runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect(device: DiscoveredDevice) {
    setConnectingId(device.deviceId);
    try {
      await addSensor(device.deviceId, device.name);
      navigate({ screen: 'sensor', id: device.deviceId });
    } finally {
      setConnectingId(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <h1 className="text-lg font-bold text-slate-100">חיבור חיישן חדש</h1>

      {atCapacity ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          כבר מחוברים {MAX_SENSORS} חיישנים — המספר המרבי הנתמך בדמו.
        </Card>
      ) : (
        <>
          <Card className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              {scanning ? (
                <>
                  <Loader2 size={16} className="animate-spin text-brand-400" />
                  מחפש חיישני VOLTSAFE בקרבת מקום…
                </>
              ) : (
                <>
                  <Bluetooth size={16} className="text-brand-400" />
                  {devices.length} חיישנים נמצאו
                </>
              )}
            </div>
            <Button variant="ghost" onClick={runScan} disabled={scanning}>
              <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
              סריקה מחדש
            </Button>
          </Card>

          <div className="flex flex-col gap-2">
            {devices.map((device) => (
              <Card key={device.deviceId} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                    <Bluetooth size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-100">{device.name}</div>
                    <div className="ltr-num text-xs text-slate-500" dir="ltr">
                      {device.deviceId}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <SignalBars rssi={device.rssi} />
                  <Button
                    variant="secondary"
                    onClick={() => handleConnect(device)}
                    disabled={connectingId !== null}
                  >
                    {connectingId === device.deviceId ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Plus size={14} />
                    )}
                    חיבור
                  </Button>
                </div>
              </Card>
            ))}
            {!scanning && devices.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">לא נמצאו חיישנים זמינים.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
