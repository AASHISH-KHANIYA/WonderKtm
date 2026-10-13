import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Seo } from '@/components/Seo';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, errMsg } from '@/services/api';

const Shell = ({ title, children, sub }: { title: string; sub?: string; children: React.ReactNode }) => <div className="container-x grid max-w-md py-16"><Seo title={title} noindex /><h1 className="text-center text-4xl sm:text-5xl">{title}</h1>{sub && <p className="mt-2 text-center text-sm text-muted">{sub}</p>}<div className="card mt-6 space-y-4 p-6">{children}</div></div>;
const pw = z.string().min(10, 'Use at least 10 characters').regex(/[a-zA-Z]/, 'Include letters').regex(/\d/, 'Include numbers');

export function Login() {
  const { login } = useAuth(); const nav = useNavigate(); const loc = useLocation(); const [err, setErr] = useState('');
  const f = useForm({ resolver: zodResolver(z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') })) });
  const to = (loc.state as any)?.from ?? '/account';
  return (
    <Shell title="Sign in" sub="Welcome back.">
      <form className="space-y-4" noValidate onSubmit={f.handleSubmit(async (v) => { setErr(''); try { const u = await login(v.email, v.password); nav(u.role !== 'customer' && to === '/account' ? '/admin' : to, { replace: true }); } catch (e) { setErr(errMsg(e)); } })}>
        <Field label="Email" error={f.formState.errors.email?.message as string}><Input type="email" autoComplete="email" {...f.register('email')} /></Field>
        <Field label="Password" error={f.formState.errors.password?.message as string}><Input type="password" autoComplete="current-password" {...f.register('password')} /></Field>
        {err && <Alert>{err}</Alert>}
        <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Sign in</Button>
      </form>
      <div className="flex justify-between text-sm"><Link to="/forgot-password" className="font-semibold text-brand hover:underline">Forgot password?</Link><Link to="/register" state={{ from: to }} className="font-semibold text-brand hover:underline">Create account</Link></div>
    </Shell>
  );
}

export function Register() {
  const { register: reg } = useAuth(); const nav = useNavigate(); const loc = useLocation(); const [err, setErr] = useState('');
  const f = useForm({ resolver: zodResolver(z.object({ firstName: z.string().trim().min(1, 'Required'), lastName: z.string().trim().optional(), email: z.string().email('Enter a valid email'), password: pw, marketingConsent: z.boolean().optional() })) });
  const e = f.formState.errors;
  return (
    <Shell title="Create account" sub="Save addresses, track orders and keep a wishlist.">
      <form className="space-y-4" noValidate onSubmit={f.handleSubmit(async (v) => { setErr(''); try { await reg({ ...v, marketingConsent: !!v.marketingConsent }); nav((loc.state as any)?.from ?? '/account', { replace: true }); } catch (x) { setErr(errMsg(x)); } })}>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="First name" error={e.firstName?.message as string}><Input autoComplete="given-name" {...f.register('firstName')} /></Field><Field label="Last name"><Input autoComplete="family-name" {...f.register('lastName')} /></Field></div>
        <Field label="Email" error={e.email?.message as string}><Input type="email" autoComplete="email" {...f.register('email')} /></Field>
        <Field label="Password" error={e.password?.message as string} hint="At least 10 characters with letters and numbers."><Input type="password" autoComplete="new-password" {...f.register('password')} /></Field>
        <label className="flex items-start gap-2 text-sm text-muted"><input type="checkbox" className="mt-1 h-4 w-4" {...f.register('marketingConsent')} /> Email me offers and news (optional)</label>
        {err && <Alert>{err}</Alert>}
        <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Create account</Button>
      </form>
      <p className="text-center text-sm">Already registered? <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link></p>
    </Shell>
  );
}

export function Forgot() {
  const [sent, setSent] = useState(false); const [err, setErr] = useState('');
  const f = useForm({ resolver: zodResolver(z.object({ email: z.string().email('Enter a valid email') })) });
  return (
    <Shell title="Reset password">
      {sent ? <Alert tone="success">If an account exists for that email, we’ve sent a reset link. It expires in 1 hour.</Alert> : (
        <form className="space-y-4" noValidate onSubmit={f.handleSubmit(async (v) => { setErr(''); try { await api.post('/auth/forgot-password', v); setSent(true); } catch (e) { setErr(errMsg(e)); } })}>
          <Field label="Email" error={f.formState.errors.email?.message as string}><Input type="email" {...f.register('email')} /></Field>{err && <Alert>{err}</Alert>}
          <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Send reset link</Button>
        </form>)}
    </Shell>
  );
}

export function Reset() {
  const [sp] = useSearchParams(); const nav = useNavigate(); const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  const f = useForm({ resolver: zodResolver(z.object({ password: pw })) });
  return (
    <Shell title="Choose a new password">
      {done ? <><Alert tone="success">Password updated. You can now sign in.</Alert><Button className="w-full" onClick={() => nav('/login')}>Sign in</Button></> : (
        <form className="space-y-4" noValidate onSubmit={f.handleSubmit(async (v) => { setErr(''); try { await api.post('/auth/reset-password', { token: sp.get('token'), password: v.password }); setDone(true); } catch (e) { setErr(errMsg(e)); } })}>
          <Field label="New password" error={f.formState.errors.password?.message as string}><Input type="password" autoComplete="new-password" {...f.register('password')} /></Field>{err && <Alert>{err}</Alert>}
          <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Update password</Button>
        </form>)}
    </Shell>
  );
}

export function VerifyEmail() {
  const [sp] = useSearchParams(); const [state, setState] = useState<'wait' | 'ok' | 'bad'>('wait');
  useEffect(() => { api.post('/auth/verify-email', { token: sp.get('token') }).then(() => setState('ok'), () => setState('bad')); }, []);
  return <Shell title="Email verification">{state === 'wait' ? <p className="text-center text-sm text-muted">Verifying…</p> : state === 'ok' ? <Alert tone="success">Your email is verified. Thank you!</Alert> : <Alert>This link is invalid or was already used.</Alert>}<Link to="/" className="btn-primary w-full">Back to the store</Link></Shell>;
}
