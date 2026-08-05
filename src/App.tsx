import { SensorProvider } from './domain/SensorContext';
import { RouterProvider } from './app/router';
import { AppShell } from './app/AppShell';
import { SimulatorPanel } from './simulator/SimulatorPanel';

export default function App() {
  return (
    <SensorProvider>
      <RouterProvider>
        <div className="flex h-screen w-full overflow-hidden bg-coal-950">
          <div className="min-w-0 flex-1">
            <AppShell />
          </div>
          <SimulatorPanel />
        </div>
      </RouterProvider>
    </SensorProvider>
  );
}
