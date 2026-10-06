import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  planCode: { type: String, required: true },
  status: { type: String, enum: ['active', 'expired', 'cancelled'], required: true },
  startedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  paymentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentOrder', required: true },
}, { timestamps: true });
export default mongoose.model('PremiumSubscription', schema);
