import mongoose from "mongoose";
import { randomBytes } from "node:crypto";

import PaymentOrder from "../models/PaymentOrder.js";
import PremiumSubscription from "../models/PremiumSubscription.js";
import { findPlan } from "../config/premiumPlans.js";
import { emitPaymentSuccess } from "./notificationSocket.js";
import { payOS } from "../config/payos.js";

const DAY = 86400000;

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};

export async function premiumStatus(userId) {
  const now = new Date();

  await PremiumSubscription.updateOne(
    {
      userId,
      status: "active",
      expiresAt: { $lte: now },
    },
    {
      $set: { status: "expired" },
    },
  );

  const subscription = await PremiumSubscription.findOne({
    userId,
  }).lean();

  const premium =
    subscription?.status === "active" && subscription.expiresAt > now;

  return {
    premium: !!premium,

    subscription: subscription
      ? {
          planCode: subscription.planCode,
          status: subscription.status,
          startedAt: subscription.startedAt,
          expiresAt: subscription.expiresAt,

          daysRemaining: premium
            ? Math.ceil((subscription.expiresAt - now) / DAY)
            : 0,
        }
      : null,
  };
}

// ======================================================
// RESPONSE TRẢ VỀ FLUTTER
// ======================================================

export function publicOrder(order) {
  return {
    id: order._id.toString(),

    orderCode: order.orderCode,

    planCode: order.planCode,
    planName: order.planName,

    amount: order.amount,
    currency: order.currency,

    status: order.status,

    transferContent: order.transferContent,

    qrCode: order.qrCode ?? "",
    checkoutUrl: order.checkoutUrl ?? "",
    paymentLinkId: order.paymentLinkId ?? "",

    bankCode: order.bankCode,
    bankAccount: order.bankAccount,
    bankAccountName: order.bankAccountName,

    expiresAt: order.expiresAt,
  };
}

// ======================================================
// TẠO ORDER
// ======================================================

export async function createOrder(userId, body) {
  // =====================================================
  // VALIDATE
  // =====================================================

  if (!body || Object.keys(body).some((key) => key !== "planCode")) {
    fail(400, "Chỉ gửi mã gói Premium.");
  }

  const plan = findPlan(body.planCode);

  if (!plan) {
    fail(400, "Gói Premium không hợp lệ.");
  }

  console.log("CREATE PREMIUM ORDER:", {
    userId: userId.toString(),
    planCode: plan.planCode,
    amount: plan.price,
  });

  // =====================================================
  // HUỶ ORDER CŨ NẾU GIÁ GÓI ĐÃ THAY ĐỔI
  //
  // Ví dụ:
  // MONTHLY cũ = 29.000
  // MONTHLY mới = 2.000
  //
  // Không cho Flutter lấy lại QR 29.000 cũ.
  // =====================================================

  await PaymentOrder.updateMany(
    {
      userId,
      planCode: plan.planCode,
      status: "pending",
      amount: { $ne: plan.price },
    },
    {
      $set: {
        status: "cancelled",
      },
    },
  );

  // =====================================================
  // KIỂM TRA ORDER PENDING HIỆN TẠI
  //
  // Chỉ reuse nếu:
  // - cùng user
  // - cùng gói
  // - cùng GIÁ
  // - chưa hết hạn
  // - đã có paymentLinkId
  // - đã có qrCode
  // =====================================================

  const existing = await PaymentOrder.findOne({
    userId,

    planCode: plan.planCode,

    // QUAN TRỌNG:
    // tránh reuse QR 29k khi giá hiện tại đã là 2k
    amount: plan.price,

    status: "pending",

    expiresAt: {
      $gt: new Date(),
    },

    paymentLinkId: {
      $type: "string",
    },

    qrCode: {
      $type: "string",
    },
  }).sort({
    createdAt: -1,
  });

  if (existing && existing.paymentLinkId && existing.qrCode) {
    console.log("REUSE PAYOS ORDER:", {
      id: existing._id.toString(),
      amount: existing.amount,
      paymentLinkId: existing.paymentLinkId,
    });

    return existing;
  }

  // =====================================================
  // TẠO MÃ ORDER CINEWAVE
  // =====================================================

  const orderCode = randomBytes(10).toString("hex").toUpperCase();

  /*
   * payOS yêu cầu orderCode dạng Number.
   *
   * Dùng timestamp giây + random nhỏ.
   * Không dùng orderCode string CineWave cho trường này.
   */
  const payOSOrderCode =
    Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 1000);

  /*
   * Nội dung chuyển khoản.
   *
   * Giữ ngắn để tương thích QR/ngân hàng.
   */
  const transferContent = `CW${orderCode}`.slice(0, 25);

  // =====================================================
  // THỜI GIAN QR
  // =====================================================

  // Cho 30 phút để test thay vì 15 phút.
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const expiredAt = Math.floor(expiresAt.getTime() / 1000);

  // =====================================================
  // RETURN / CANCEL URL
  // =====================================================

  const returnUrl = process.env.PAYOS_RETURN_URL || "https://payos.vn";

  const cancelUrl = process.env.PAYOS_CANCEL_URL || "https://payos.vn";

  // =====================================================
  // TẠO PAYMENT LINK PAYOS
  // =====================================================

  let payment;

  try {
    payment = await payOS.paymentRequests.create({
      orderCode: payOSOrderCode,

      // Giá luôn lấy từ backend.
      amount: plan.price,

      description: transferContent,

      returnUrl,
      cancelUrl,

      expiredAt,

      items: [
        {
          name: plan.name,
          quantity: 1,
          price: plan.price,
        },
      ],
    });
  } catch (error) {
    console.error("PAYOS CREATE PAYMENT ERROR:", error?.message ?? error);

    fail(503, "Không thể tạo giao dịch payOS. Vui lòng thử lại.");
  }

  // =====================================================
  // KIỂM TRA RESPONSE PAYOS
  // =====================================================

  if (!payment || !payment.paymentLinkId || !payment.qrCode) {
    console.error("PAYOS INVALID RESPONSE:", payment);

    fail(503, "payOS không trả về thông tin thanh toán hợp lệ.");
  }

  // =====================================================
  // LOG ĐỂ TEST
  //
  // KHÔNG log Client ID/API key/Checksum key.
  // =====================================================

  console.log("=== PAYOS NEW ORDER ===");

  console.log({
    cinewaveOrderCode: orderCode,

    payOSOrderCode,

    amount: plan.price,

    paymentLinkId: payment.paymentLinkId,

    status: payment.status,

    bin: payment.bin,

    accountNumber: payment.accountNumber,

    accountName: payment.accountName,

    checkoutUrl: payment.checkoutUrl,

    qrCodeLength: payment.qrCode?.length,
  });

  // =====================================================
  // LƯU DATABASE
  // =====================================================

  const createdOrder = await PaymentOrder.create({
    userId,

    orderCode,

    payOSOrderCode,

    transferContent,

    planCode: plan.planCode,

    planName: plan.name,

    durationDays: plan.durationDays,

    // Giá snapshot của order.
    amount: plan.price,

    currency: "VND",

    status: "pending",

    paymentMethod: "payos",

    bankCode: payment.bin ?? "",

    bankAccount: payment.accountNumber ?? "",

    bankAccountName: payment.accountName ?? "",

    paymentLinkId: payment.paymentLinkId,

    checkoutUrl: payment.checkoutUrl ?? "",

    // Đây là payload QR thật do payOS trả về.
    qrCode: payment.qrCode,

    expiresAt,
  });

  console.log("PAYMENT ORDER SAVED:", {
    id: createdOrder._id.toString(),

    amount: createdOrder.amount,

    planCode: createdOrder.planCode,

    expiresAt: createdOrder.expiresAt,
  });

  return createdOrder;
}
// ======================================================
// LẤY ORDER
// ======================================================

export async function getOrder(userId, id) {
  if (!mongoose.isObjectIdOrHexString(id)) {
    fail(404, "Không tìm thấy giao dịch.");
  }

  // Nếu hết thời gian mà vẫn pending
  await PaymentOrder.updateOne(
    {
      _id: id,
      userId,
      status: "pending",
      expiresAt: {
        $lte: new Date(),
      },
    },
    {
      $set: {
        status: "expired",
      },
    },
  );

  const order = await PaymentOrder.findOne({
    _id: id,
    userId,
  });

  if (!order) {
    fail(404, "Không tìm thấy giao dịch.");
  }

  return order;
}

// ======================================================
// PAYOS WEBHOOK -> XÁC NHẬN THANH TOÁN
// ======================================================

export async function confirmPayment(data) {
  /*
   * data ở đây ĐÃ được verify bởi:
   *
   * payOS.webhooks.verify(req.body)
   */

  if (!data) {
    fail(400, "Dữ liệu thanh toán không hợp lệ.");
  }

  const paymentLinkId = data.paymentLinkId;

  const payOSOrderCode = Number(data.orderCode);

  /*
   * Khi đăng ký webhook, payOS có thể gửi
   * payload mẫu để kiểm tra endpoint.
   *
   * Nếu không tồn tại order trong DB,
   * acknowledge webhook nhưng không kích hoạt Premium.
   */

  const order = await PaymentOrder.findOne({
    $or: [
      {
        paymentLinkId,
      },
      {
        payOSOrderCode,
      },
    ],
  });

  if (!order) {
    console.log("PAYOS WEBHOOK IGNORED: order not found", {
      paymentLinkId,
      orderCode: data.orderCode,
    });

    return {
      ok: true,
      ignored: true,
    };
  }

  // --------------------------------------------
  // Kiểm tra tiền
  // --------------------------------------------

  if (Number(data.amount) !== Number(order.amount)) {
    fail(409, "Số tiền thanh toán không khớp.");
  }

  if (data.currency && data.currency !== "VND") {
    fail(409, "Loại tiền thanh toán không hợp lệ.");
  }

  // Description chính là nội dung CK
  if (data.description && data.description !== order.transferContent) {
    fail(409, "Nội dung thanh toán không khớp.");
  }

  // --------------------------------------------
  // Idempotency
  // --------------------------------------------

  if (order.status === "paid") {
    return {
      ok: true,
      duplicate: true,
    };
  }

  /*
   * reference là mã giao dịch ngân hàng
   * payOS trả về.
   */

  const transactionId = data.reference
    ? String(data.reference)
    : `PAYOS-${paymentLinkId}`;

  // --------------------------------------------
  // Transaction MongoDB
  // --------------------------------------------

  const session = await mongoose.startSession();

  let result;

  try {
    await session.withTransaction(async () => {
      /*
       * Query lại bên trong transaction
       * để tránh webhook tới 2 lần cùng lúc.
       */

      const freshOrder = await PaymentOrder.findById(order._id).session(
        session,
      );

      if (!freshOrder) {
        fail(404, "Không tìm thấy giao dịch.");
      }

      // Webhook đã xử lý rồi
      if (freshOrder.status === "paid") {
        result = {
          order: freshOrder,
          duplicate: true,
        };

        return;
      }

      // Chỉ cho pending/expired được chuyển paid
      if (!["pending", "expired"].includes(freshOrder.status)) {
        fail(409, "Trạng thái giao dịch không hợp lệ.");
      }

      // --------------------------------------
      // Đánh dấu order PAID
      // --------------------------------------

      freshOrder.status = "paid";

      freshOrder.paidAt = new Date();

      freshOrder.providerTransactionId = transactionId;

      await freshOrder.save({
        session,
      });

      // --------------------------------------
      // PREMIUM SUBSCRIPTION
      // --------------------------------------

      const now = new Date();

      let subscription = await PremiumSubscription.findOne({
        userId: freshOrder.userId,
      }).session(session);

      const active =
        subscription?.status === "active" && subscription.expiresAt > now;

      /*
       * Nếu đang Premium:
       * cộng thêm ngày vào ngày hết hạn hiện tại.
       *
       * Nếu chưa Premium:
       * tính từ thời điểm thanh toán.
       */

      const baseTime = active
        ? subscription.expiresAt.getTime()
        : now.getTime();

      const expiresAt = new Date(baseTime + freshOrder.durationDays * DAY);

      if (!subscription) {
        subscription = new PremiumSubscription({
          userId: freshOrder.userId,
        });
      }

      subscription.set({
        planCode: freshOrder.planCode,

        status: "active",

        startedAt: active ? subscription.startedAt : now,

        expiresAt,

        paymentOrderId: freshOrder._id,
      });

      await subscription.save({
        session,
      });

      result = {
        order: freshOrder,
        subscription,
        duplicate: false,
      };
    });
  } catch (error) {
    if (error?.code === 11000) {
      /*
       * Có thể webhook duplicate tới cùng lúc.
       * Kiểm tra lại DB.
       */

      const paidOrder = await PaymentOrder.findById(order._id);

      if (paidOrder?.status === "paid") {
        return {
          ok: true,
          duplicate: true,
        };
      }

      fail(409, "Giao dịch đã được xử lý hoặc đang được xử lý.");
    }

    throw error;
  } finally {
    await session.endSession();
  }

  // --------------------------------------------
  // Socket realtime -> Flutter
  // --------------------------------------------

  if (result && !result.duplicate && result.subscription) {
    emitPaymentSuccess(result.order.userId.toString(), {
      orderId: result.order._id.toString(),

      orderCode: result.order.orderCode,

      planCode: result.order.planCode,

      subscription: {
        expiresAt: result.subscription.expiresAt,
      },
    });

    console.log("PAYMENT SUCCESS:", {
      orderId: result.order._id.toString(),

      amount: result.order.amount,

      planCode: result.order.planCode,

      userId: result.order.userId.toString(),
    });
  }

  return {
    ok: true,
    duplicate: result?.duplicate ?? false,
  };
}
