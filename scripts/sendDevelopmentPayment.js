import 'dotenv/config';
import { createHmac } from 'node:crypto';

// Manual local checkout exercise only. This is not an HTTP activation endpoint.
if (process.env.NODE_ENV !== 'development' || process.env.RENDER || process.env.RENDER_SERVICE_ID) {
  throw new Error('Development payment sender only runs locally with NODE_ENV=development.');
}
const [orderCode, amountText] = process.argv.slice(2);
const amount = Number(amountText);
const secret = process.env.PAYMENT_WEBHOOK_SECRET;
if (!/^[A-F0-9]{20}$/.test(orderCode ?? '') || !Number.isSafeInteger(amount) || amount <= 0 || !secret || secret.length < 32) {
  throw new Error('Usage: node scripts/sendDevelopmentPayment.js ORDER_CODE AMOUNT; configure the local webhook secret first.');
}
const body = JSON.stringify({ transactionId: `dev:${orderCode}`, transferContent: `CW ${orderCode}`,
  amount, currency: 'VND', direction: 'credit', bankCode: process.env.VIETQR_BANK_ID,
  bankAccount: process.env.VIETQR_ACCOUNT_NO, paidAt: new Date().toISOString() });
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
const response = await fetch(`http://127.0.0.1:${Number(process.env.PORT) || 8080}/api/payments/webhook`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-payment-timestamp': timestamp, 'x-payment-signature': signature }, body,
});
console.log('Webhook status:', response.status, await response.text());
