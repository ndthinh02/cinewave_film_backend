import { payOS } from "../config/payos.js";

export async function verifyPaymentWebhook(req) {
  try {
    // payOS SDK tự kiểm tra signature bằng PAYOS_CHECKSUM_KEY
    const data = await payOS.webhooks.verify(req.body);

    return data;
  } catch (error) {
    console.error("PAYOS WEBHOOK VERIFY ERROR:", error?.message ?? error);

    throw Object.assign(
      new Error("Webhook payOS không hợp lệ."),
      { status: 401 },
    );
  }
}