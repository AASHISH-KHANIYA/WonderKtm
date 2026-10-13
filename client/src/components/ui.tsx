import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import clsx from 'clsx';

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={clsx('animate-spin', className ?? 'h-5 w-5')} aria-label="Loading" />;
export const PageLoader = () => <div className="grid min-h-[40vh] place-items-center text-brand"><Spinner className="h-7 w-7" /></div>;

export function Button({ variant = 'primary', size, loading, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'accent' | 'outline' | 'ghost' | 'danger'; size?: 'sm'; loading?: boolean }) {
  return (
    <button className={clsx(`btn-${variant}`, size === 'sm' && 'btn-sm', className)} disabled={p.disabled || loading} {...p}>
      {loading && <Spinner className="h-4 w-4" />}{children}
    </button>
  );
}

export const Field = ({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) => (
  <label className={clsx('block', className)}>
    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy/80">{label}</span>
    {children}
    {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    {error && <span role="alert" className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
  </label>
);
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, r) => <input ref={r} className={clsx('input', className)} {...p} />);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, r) => <textarea ref={r} className={clsx('input min-h-[96px]', className)} {...p} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, r) => <select ref={r} className={clsx('input pr-8', className)} {...p}>{children}</select>);

export const Badge = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'gold' }) => (
  <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold', { neutral: 'bg-navy/5 text-navy', good: 'bg-emerald-50 text-emerald-700', warn: 'bg-amber-50 text-amber-700', bad: 'bg-red-50 text-red-700', info: 'bg-sky-50 text-sky-700', gold: 'bg-gold/30 text-navy' }[tone])}>{children}</span>
);
export const statusTone = (s: string) => (['paid', 'delivered', 'approved', 'confirmed', 'published'].includes(s) ? 'good' : ['rejected', 'cancelled', 'returned', 'refunded', 'disabled'].includes(s) ? 'bad' : ['submitted', 'under_review', 'awaiting_payment_verification', 'refund_pending', 'cancellation_requested', 'return_requested', 'draft'].includes(s) ? 'warn' : ['shipped', 'out_for_delivery', 'processing', 'packed'].includes(s) ? 'info' : 'neutral') as 'good';

export const Alert = ({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info' | 'warn'; children: ReactNode }) => (
  <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm', { error: 'border-red-200 bg-red-50 text-red-800', success: 'border-emerald-200 bg-emerald-50 text-emerald-800', info: 'border-sky-200 bg-sky-50 text-sky-800', warn: 'border-amber-200 bg-amber-50 text-amber-900' }[tone])}>
    {tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}<div>{children}</div>
  </div>
);

export const EmptyState = ({ title, text, action }: { title: string; text?: string; action?: ReactNode }) => (
  <div className="card grid place-items-center gap-2 px-6 py-14 text-center"><h3 className="text-2xl">{title}</h3>{text && <p className="max-w-md text-sm text-muted">{text}</p>}{action}</div>
);

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Callers pass an inline onClose, which is a new function on every render. Keeping it in a ref stops the
  // effect below from re-running on each keystroke (which moved focus out of the field being typed in).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={clsx('card max-h-[92vh] w-full overflow-y-auto p-6', wide ? 'max-w-3xl' : 'max-w-md')}>
        <div className="mb-4 flex items-start justify-between gap-4"><h2 className="text-2xl">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-navy/5"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, loading, onConfirm, onClose, children }: { open: boolean; title: string; message?: string; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void; children?: ReactNode }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {message && <p className="mb-4 text-sm text-ink/80">{message}</p>}{children}
      <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></div>
    </Modal>
  );
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
      <span className="px-2 text-sm text-muted">Page {page} of {pages}</span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</Button>
    </nav>
  );
}

// ---- toasts ----
type Toast = { id: number; tone: 'success' | 'error'; text: string };
const ToastCtx = createContext<(tone: Toast['tone'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2" aria-live="polite">
        {items.map((t) => <div key={t.id} className={clsx('pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium text-white shadow-soft', t.tone === 'success' ? 'bg-navy' : 'bg-red-600')}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
