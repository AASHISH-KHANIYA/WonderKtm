import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { Site } from '@/types';

const Ctx = createContext<{ site?: Site; loading: boolean }>({ loading: true });
export const useSite = () => useContext(Ctx);

const hexToRgb = (h: string) => { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`; };
const THEME_VARS: Record<string, string> = { navy: '--c-navy', blue: '--c-blue', cream: '--c-cream', yellow: '--c-yellow', ink: '--c-ink', muted: '--c-muted', line: '--c-line' };

export function SiteProvider({ children }: { children: ReactNode }) {
  const q = useQuery({ queryKey: ['site'], queryFn: () => api.get<Site>('/site'), staleTime: 60_000 });
  useEffect(() => {
    const t = q.data?.theme;
    if (!t) return;
    Object.entries(t).forEach(([k, v]) => THEME_VARS[k] && /^#[0-9a-f]{6}$/i.test(v) && document.documentElement.style.setProperty(THEME_VARS[k], hexToRgb(v)));
  }, [q.data?.theme]);
  return <Ctx.Provider value={{ site: q.data, loading: q.isLoading }}>{children}</Ctx.Provider>;
}
