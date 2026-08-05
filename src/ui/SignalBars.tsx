export function SignalBars({ rssi }: { rssi: number }) {
  // Rough dBm -> bar mapping: closer to 0 is stronger.
  const strength = rssi >= -55 ? 4 : rssi >= -65 ? 3 : rssi >= -75 ? 2 : rssi >= -85 ? 1 : 0;
  return (
    <div className="flex items-end gap-0.5" title={`עוצמת קליטה: ${rssi} dBm`}>
      {[1, 2, 3, 4].map((bar) => (
        <div
          key={bar}
          className={`w-1 rounded-sm ${bar <= strength ? 'bg-slate-300' : 'bg-coal-600'}`}
          style={{ height: `${bar * 3 + 2}px` }}
        />
      ))}
    </div>
  );
}
