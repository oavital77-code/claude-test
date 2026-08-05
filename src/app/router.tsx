import React, { createContext, useContext, useState } from 'react';

export type Route =
  | { screen: 'home' }
  | { screen: 'sensor'; id: string }
  | { screen: 'settings'; id: string }
  | { screen: 'alerts' }
  | { screen: 'add' };

interface RouterContextValue {
  route: Route;
  navigate: (route: Route) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<Route>({ screen: 'home' });
  return (
    <RouterContext.Provider value={{ route, navigate: setRoute }}>{children}</RouterContext.Provider>
  );
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within RouterProvider');
  return ctx;
}
