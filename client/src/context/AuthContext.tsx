import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { User } from '@/types';

interface AuthState { user: User | null; loading: boolean; refresh: () => Promise<unknown>; login: (email: string, password: string) => Promise<User>; register: (b: Record<string, unknown>) => Promise<User>; logout: () => Promise<void>; isStaff: boolean }
const Ctx = createContext<AuthState>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ user: User | null }>('/auth/me'), staleTime: 60_000 });
  const user = q.data?.user ?? null;
  const set = (u: User | null) => qc.setQueryData(['me'], { user: u });
  const value: AuthState = {
    user, loading: q.isLoading, isStaff: !!user && user.role !== 'customer', refresh: () => q.refetch(),
    login: async (email, password) => { const r = await api.post<{ user: User }>('/auth/login', { email, password }); set(r.user); qc.invalidateQueries({ queryKey: ['wishlist'] }); return r.user; },
    register: async (b) => { const r = await api.post<{ user: User }>('/auth/register', b); set(r.user); return r.user; },
    logout: async () => { await api.post('/auth/logout'); set(null); qc.removeQueries({ queryKey: ['wishlist'] }); qc.removeQueries({ predicate: (x) => String(x.queryKey[0]).startsWith('admin') }); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
