import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { Notification } from '../models/index.js';

export const emailConfigured = () => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
let transporter: nodemailer.Transporter | null = null;
const getTransport = () => (transporter ??= nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }));

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function layout(title: string, bodyHtml: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#25282D"><h2 style="color:#17263C;margin:0 0 16px">Wonderktm</h2><h3>${esc(title)}</h3>${bodyHtml}<hr style="border:none;border-top:1px solid #E8E8E5;margin:24px 0"/><p style="color:#707782;font-size:12px">Wonderktm · Discover Delight Repeat.</p></div>`;
}

export type EmailEvent =
  | 'registration' | 'email_verification' | 'password_reset' | 'order_placed' | 'payment_submitted' | 'payment_approved' | 'payment_rejected'
  | 'order_confirmed' | 'order_shipped' | 'order_delivered' | 'order_cancelled' | 'refund_update' | 'low_stock';

const T: Record<EmailEvent, (d: any) => { subject: string; html: string }> = {
  registration: (d) => ({ subject: 'Welcome to Wonderktm', html: layout('Welcome!', `<p>Hi ${esc(d.name)}, your account is ready.</p>`) }),
  email_verification: (d) => ({ subject: 'Verify your email', html: layout('Verify your email', `<p>Confirm your email address to finish setting up your account.</p><p><a href="${esc(d.url)}">Verify email</a></p>`) }),
  password_reset: (d) => ({ subject: 'Reset your password', html: layout('Reset your password', `<p>Use this link within 1 hour to choose a new password. If you did not ask for this, ignore this email.</p><p><a href="${esc(d.url)}">Reset password</a></p>`) }),
  order_placed: (d) => ({ subject: `We received order ${d.orderNumber}`, html: layout(`Order ${esc(d.orderNumber)} received`, `<p>Total: <b>${esc(d.currency)} ${esc(d.total)}</b>.</p><p>Your payment must be verified by our team before we confirm the order.</p><p><a href="${esc(d.url)}">Track your order</a></p>`) }),
  payment_submitted: (d) => ({ subject: `Payment evidence received for ${d.orderNumber}`, html: layout('Payment evidence received', `<p>We will verify the payment manually and email you the result.</p>`) }),
  payment_approved: (d) => ({ subject: `Payment verified for ${d.orderNumber}`, html: layout('Payment verified', `<p>Your payment was verified and your order is confirmed.</p><p><a href="${esc(d.url)}">Track your order</a></p>`) }),
  payment_rejected: (d) => ({ subject: `Payment could not be verified for ${d.orderNumber}`, html: layout('Payment could not be verified', `<p>Reason: ${esc(d.reason)}</p><p>You can upload corrected evidence from your order page.</p><p><a href="${esc(d.url)}">Open order</a></p>`) }),
  order_confirmed: (d) => ({ subject: `Order ${d.orderNumber} confirmed`, html: layout('Order confirmed', `<p>Thank you! We are preparing your order.</p>`) }),
  order_shipped: (d) => ({ subject: `Order ${d.orderNumber} has shipped`, html: layout('Your order has shipped', `<p>${d.carrier ? `Carrier: ${esc(d.carrier)}. ` : ''}${d.trackingNumber ? `Tracking: ${esc(d.trackingNumber)}.` : ''}</p>`) }),
  order_delivered: (d) => ({ subject: `Order ${d.orderNumber} delivered`, html: layout('Delivered', `<p>Your order was marked as delivered.</p>`) }),
  order_cancelled: (d) => ({ subject: `Order ${d.orderNumber} cancelled`, html: layout('Order cancelled', `<p>${esc(d.reason || '')}</p>`) }),
  refund_update: (d) => ({ subject: `Refund update for ${d.orderNumber}`, html: layout('Refund update', `<p>Status: ${esc(d.status)}</p>`) }),
  low_stock: (d) => ({ subject: `Low stock: ${d.name}`, html: layout('Low stock warning', `<p>${esc(d.name)} (${esc(d.sku)}) has ${esc(d.stock)} left.</p>`) }),
};

/** Sends an email if SMTP is configured. Always records the real outcome — never claims success when nothing was sent. */
export async function notify(event: EmailEvent, to: string | undefined, data: Record<string, unknown>, orderId?: unknown) {
  if (!to) return 'skipped_not_configured' as const;
  const { subject, html } = T[event](data);
  let status: 'sent' | 'failed' | 'skipped_not_configured' = 'skipped_not_configured';
  let error: string | undefined;
  if (emailConfigured()) {
    try {
      await getTransport().sendMail({ from: env.EMAIL_FROM, to, subject, html });
      status = 'sent';
    } catch (e) {
      status = 'failed';
      error = (e as Error).message.slice(0, 300);
    }
  }
  await Notification.create({ event, to, subject, status, error, order: orderId as never }).catch(() => undefined);
  return status;
}

/** In-app admin notification (always recorded) plus an email to the admin address when configured. */
export async function notifyAdmin(event: EmailEvent, data: Record<string, unknown>, orderId?: unknown, adminEmail?: string) {
  await Notification.create({ event, channel: 'admin', subject: String(data.summary ?? event), status: 'recorded', order: orderId as never }).catch(() => undefined);
  const to = adminEmail || env.ADMIN_NOTIFY_EMAIL;
  if (to) await notify(event, to, data, orderId);
}
