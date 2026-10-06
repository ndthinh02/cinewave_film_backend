import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Mã nội bộ CineWave
    orderCode: {
      type: String,
      required: true,
      unique: true,
    },

    // orderCode dạng Number gửi sang payOS
    payOSOrderCode: {
      type: Number,
    },

    transferContent: {
      type: String,
      required: true,
      unique: true,
    },

    planCode: {
      type: String,
      required: true,
    },

    planName: {
      type: String,
      required: true,
    },

    durationDays: {
      type: Number,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "VND",
      enum: ["VND"],
    },

    status: {
      type: String,
      enum: [
        "pending",
        "paid",
        "expired",
        "cancelled",
        "failed",
      ],
      default: "pending",
    },

    paymentMethod: {
      type: String,
      default: "payos",
    },

    bankCode: {
      type: String,
      required: true,
    },

    bankAccount: {
      type: String,
      required: true,
    },

    bankAccountName: {
      type: String,
      required: true,
    },

    // Dữ liệu payOS
    paymentLinkId: {
      type: String,
    },

    checkoutUrl: {
      type: String,
    },

    qrCode: {
      type: String,
    },

    providerTransactionId: {
      type: String,
    },

    paidAt: Date,

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

schema.index({
  userId: 1,
  createdAt: -1,
});

// Chỉ unique khi paymentLinkId thực sự là String.
// Tránh lỗi duplicate paymentLinkId: null.
schema.index(
  { paymentLinkId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      paymentLinkId: { $type: "string" },
    },
  },
);

schema.index(
  { payOSOrderCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      payOSOrderCode: { $type: "number" },
    },
  },
);

schema.index(
  { providerTransactionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      providerTransactionId: { $type: "string" },
    },
  },
);

export default mongoose.model("PaymentOrder", schema);