import { useRef, useState } from 'react';
import { CheckCircle2, Upload } from 'lucide-react';
import { Alert, Badge, Button, ConfirmDialog, Field, Input, statusTone } from '@/components/ui';
import { dateTime, img, label, money, countryName } from '@/utils/format';
import { errMsg } from '@/services/api';

export interface OrderData {
  id: string; orderNumber: string; placedAt: string; currency: 'NPR' | 'INR'; subtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number; total: number;
  customer: { firstName: string; lastName: string; email: string; phone: string }; shippingAddress: Record<string, string>; items: { name: string; variantLabel?: string; image?: string; unitPrice: number; quantity: number; lineTotal: number }[];
  paymentStatus: string; fulfilmentStatus: string; shipping?: { methodName?: string; estimatedDays?: string; isFree?: boolean }; shipment?: { carrier?: string; trackingNumber?: string };
  coupon?: { code: string; discount: number } | null; cancelReason?: string; canUploadEvidence: boolean;
  paymentMethod: { key: string; label: string; type?: 'qr' | 'cod'; qrImageUrl?: string; instructions?: string; merchantInfo?: string };
  payment: { status: string; transactionRef?: string; evidenceCount: number; rejectionReason?: string } | null; history: { kind: string; to: string; at: string; note?: string }[];
}

const FLOW = ['awaiting_payment_verification', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

export function OrderView({ order, onUpload, onCancel, isNew }: { order: OrderData; onUpload: (file: File, ref: string) => Promise<unknown>; onCancel: () => Promise<unknown>; isNew?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const cancelled = ['cancelled', 'returned'].includes(order.fulfilmentStatus);
  const idx = FLOW.indexOf(order.fulfilmentStatus);
  const showPay = order.paymentMethod.type === 'qr' && order.canUploadEvidence;

  const submit = async () => {
    if (!file) { setMsg({ tone: 'error', text: 'Please choose your payment screenshot first.' }); return; }
    if (file.size > 5 * 1024 * 1024) { setMsg({ tone: 'error', text: 'That file is larger than 5 MB.' }); return; }
    setBusy(true); setMsg(null);
    try { await onUpload(file, ref); setFile(null); setRef(''); if (input.current) input.current.value = ''; setMsg({ tone: 'success', text: 'Evidence received. Our team will verify your payment and update this page.' }); }
    catch (e) { setMsg({ tone: 'error', text: errMsg(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {isNew && <Alert tone="success"><b>Thank you! Your order {order.orderNumber} was placed.</b> {order.paymentMethod.type === 'qr' ? 'Complete the payment below. Your order is confirmed after our team verifies it.' : 'We will confirm your order shortly. Pay in cash on delivery.'} Save this page’s link to track your order.</Alert>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-4xl">Order {order.orderNumber}</h1><p className="text-sm text-muted">Placed {dateTime(order.placedAt)}</p></div>
        <div className="flex flex-wrap gap-2"><Badge tone={statusTone(order.paymentStatus)}>Payment: {label(order.paymentStatus)}</Badge><Badge tone={statusTone(order.fulfilmentStatus)}>{label(order.fulfilmentStatus)}</Badge></div>
      </div>

      {!cancelled && idx >= 0 && (
        <ol className="card grid grid-cols-4 gap-2 p-4 text-center text-[11px] font-semibold sm:grid-cols-7" aria-label="Order progress">
          {FLOW.map((s, i) => <li key={s} className={i <= idx ? 'text-navy' : 'text-muted/60'}><div className={`mx-auto mb-1 grid h-6 w-6 place-items-center rounded-full ${i <= idx ? 'bg-navy text-white' : 'bg-navy/10'}`}>{i < idx ? <CheckCircle2 className="h-4 w-4" /> : i + 1}</div>{label(s).replace('Awaiting payment verification', 'Verifying')}</li>)}
        </ol>
      )}
      {cancelled && <Alert tone="warn">This order is {order.fulfilmentStatus}. {order.cancelReason}</Alert>}
      {order.shipment?.trackingNumber && <Alert tone="info">Shipped{order.shipment.carrier && ` with ${order.shipment.carrier}`} · tracking number <b>{order.shipment.trackingNumber}</b></Alert>}

      {order.paymentMethod.type === 'qr' && order.paymentStatus !== 'paid' && !cancelled && (
        <section className="card space-y-4 p-6" aria-labelledby="pay-h">
          <h2 id="pay-h" className="text-2xl">Pay with {order.paymentMethod.label}</h2>
          {order.paymentStatus === 'rejected' && <Alert>We could not verify your payment{order.payment?.rejectionReason && <>: <b>{order.payment.rejectionReason}</b></>}. Please upload corrected evidence below.</Alert>}
          {order.paymentStatus === 'submitted' && <Alert tone="info">We received your payment evidence ({order.payment?.evidenceCount} file{order.payment?.evidenceCount === 1 ? '' : 's'}). It is waiting for manual verification. Uploading a screenshot does not complete the payment until our team confirms the money has arrived.</Alert>}
          {order.paymentStatus === 'under_review' && <Alert tone="info">Our team is reviewing your payment now.</Alert>}
          {showPay && (
            <div className="grid gap-6 md:grid-cols-[240px_1fr]">
              <div>{order.paymentMethod.qrImageUrl ? <img src={order.paymentMethod.qrImageUrl} alt={`${order.paymentMethod.label} QR code`} className="w-full rounded-xl border border-line bg-white p-2" /> : <Alert tone="warn">The QR code is not available right now. Please contact us to complete payment.</Alert>}</div>
              <div className="space-y-3 text-sm">
                <div className="rounded-xl bg-navy p-4 text-white"><div className="text-xs uppercase tracking-wide text-white/70">Pay exactly</div><div className="font-display text-4xl font-bold text-gold">{money(order.total, order.currency)}</div><div className="text-xs text-white/70">Currency: {order.currency}</div></div>
                {order.paymentMethod.merchantInfo && <p><b>Pay to:</b> {order.paymentMethod.merchantInfo}</p>}
                {order.paymentMethod.instructions && <p className="whitespace-pre-line text-ink/80">{order.paymentMethod.instructions}</p>}
                <p className="text-xs text-muted">Never share your OTP, password, PIN or card details. We only need a screenshot and the transaction ID.</p>
              </div>
              <div className="space-y-3 md:col-span-2">
                <h3 className="font-sans text-sm font-bold">Upload your payment evidence</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Transaction ID / reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} placeholder="e.g. 0A1B2C3D" /></Field>
                  <Field label="Screenshot (JPG, PNG or WebP, max 5 MB)"><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="input file:mr-3 file:rounded-full file:border-0 file:bg-navy file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white" /></Field>
                </div>
                {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
                <Button onClick={submit} loading={busy}><Upload className="h-4 w-4" /> {order.paymentStatus === 'submitted' ? 'Upload another file' : 'Submit evidence'}</Button>
              </div>
            </div>
          )}
        </section>
      )}
      {order.paymentMethod.type === 'cod' && !cancelled && order.paymentStatus !== 'paid' && <Alert tone="info">Cash on delivery: please keep {money(order.total, order.currency)} ready.</Alert>}

      <section className="card p-6"><h2 className="text-2xl">Items</h2>
        <ul className="mt-3 divide-y divide-line">{order.items.map((i, k) => <li key={k} className="flex gap-3 py-3 text-sm"><img src={img(i.image)} alt="" className="h-14 w-14 rounded-lg object-cover" /><div className="flex-1"><p className="font-semibold">{i.name}</p><p className="text-xs text-muted">{i.variantLabel && `${i.variantLabel} · `}{money(i.unitPrice, order.currency)} × {i.quantity}</p></div><span className="font-medium">{money(i.lineTotal, order.currency)}</span></li>)}</ul>
        <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{money(order.subtotal, order.currency)}</dd></div>
          {order.discountTotal > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount {order.coupon && `(${order.coupon.code})`}</dt><dd>−{money(order.discountTotal, order.currency)}</dd></div>}
          <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd>{order.shippingTotal ? money(order.shippingTotal, order.currency) : 'Free'}</dd></div>
          <div className="flex justify-between text-base font-bold text-navy"><dt>Total</dt><dd>{money(order.total, order.currency)}</dd></div>
        </dl></section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-6 text-sm"><h2 className="text-2xl">Delivery</h2><p className="mt-2 leading-6">{order.customer.firstName} {order.customer.lastName}<br />{order.shippingAddress.street}{order.shippingAddress.building && `, ${order.shippingAddress.building}`}<br />{[order.shippingAddress.city, order.shippingAddress.district, order.shippingAddress.region].filter(Boolean).join(', ')}<br />{countryName(order.shippingAddress.country)}</p>{order.shipping?.estimatedDays && <p className="mt-2 text-muted">Estimated: {order.shipping.estimatedDays}</p>}</section>
        <section className="card p-6 text-sm"><h2 className="text-2xl">History</h2><ol className="mt-2 space-y-2">{order.history.map((h, i) => <li key={i} className="flex justify-between gap-3"><span>{label(h.to)}{h.note && <span className="text-muted"> — {h.note}</span>}</span><time className="shrink-0 text-xs text-muted">{dateTime(h.at)}</time></li>)}</ol></section>
      </div>
      {!cancelled && ['awaiting_payment_verification', 'confirmed', 'processing'].includes(order.fulfilmentStatus) && <div><Button variant="ghost" onClick={() => setConfirmCancel(true)}>{order.paymentStatus === 'paid' ? 'Request cancellation' : 'Cancel this order'}</Button></div>}
      <ConfirmDialog open={confirmCancel} danger title="Cancel this order?" message={order.paymentStatus === 'paid' ? 'Your payment has been verified, so we will review your cancellation request.' : 'This will cancel the order and release the items.'} confirmLabel="Yes, cancel" onClose={() => setConfirmCancel(false)} onConfirm={async () => { try { await onCancel(); } catch (e) { setMsg({ tone: 'error', text: errMsg(e) }); } setConfirmCancel(false); }} />
    </div>
  );
}
