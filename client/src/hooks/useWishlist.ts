import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui';
import type { Product } from '@/types';

export function useWishlist() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const q = useQuery({ queryKey: ['wishlist'], queryFn: () => api.get<{ items: Product[] }>('/wishlist'), enabled: !!user });
  const ids = new Set((q.data?.items ?? []).map((p) => p.id));
  const m = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => (on ? api.del(`/wishlist/${id}`) : api.post(`/wishlist/${id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wishlist'] }),
    onError: () => toast('error', 'Could not update your wishlist.'),
  });
  return {
    items: q.data?.items ?? [], loading: q.isLoading, has: (id: string) => ids.has(id),
    toggle: (id: string) => { if (!user) { toast('error', 'Sign in to save items to your wishlist.'); nav('/login', { state: { from: location.pathname } }); return; } m.mutate({ id, on: ids.has(id) }); },
  };
}
