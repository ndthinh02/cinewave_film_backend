import { Router } from "express";

import { auth } from "../middleware/auth.js";

import {
  createOrder,
  getOrder,
  publicOrder,
  confirmPayment,
} from "../services/premiumPayments.js";

import {
  verifyPaymentWebhook,
} from "../services/paymentProvider.js";

const router = Router();

const handle =
  (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      console.error(
        "PAYMENT ERROR:",
        error?.message ?? error,
      );

      res
        .status(
          error.status ?? 503,
        )
        .json({
          message:
            error.status
              ? error.message
              : "Dịch vụ thanh toán tạm thời không khả dụng. Vui lòng thử lại.",
        });
    }
  };

// ======================================================
// PAYOS WEBHOOK
// KHÔNG auth endpoint này
// ======================================================

router.post(
  "/webhook",

  handle(
    async (req, res) => {
      const data =
        await verifyPaymentWebhook(
          req,
        );

      console.log(
        "PAYOS WEBHOOK RECEIVED:",
        {
          orderCode:
            data.orderCode,

          amount:
            data.amount,

          paymentLinkId:
            data.paymentLinkId,

          reference:
            data.reference,
        },
      );

      const result =
        await confirmPayment(
          data,
        );

      /*
       * payOS cần HTTP 2xx để biết
       * webhook đã được nhận.
       */
      return res
        .status(200)
        .json(result);
    },
  ),
);

// ======================================================
// CREATE ORDER
// ======================================================

router.post(
  "/orders",

  auth,

  handle(
    async (req, res) => {
      const order =
        await createOrder(
          req.user.id,
          req.body,
        );

      return res
        .status(201)
        .json({
          order:
            publicOrder(order),
        });
    },
  ),
);

// ======================================================
// GET ORDER - Flutter polling
// ======================================================

router.get(
  "/orders/:orderId",

  auth,

  handle(
    async (req, res) => {
      const order =
        await getOrder(
          req.user.id,
          req.params.orderId,
        );

      return res.json({
        order:
          publicOrder(order),
      });
    },
  ),
);

export default router;