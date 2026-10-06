import mongoose from "mongoose";
const schema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["follow", "reaction", "comment", "reply"], required: true },
  reviewId: { type: mongoose.Schema.Types.ObjectId, ref: "MovieReview", default: null },
  commentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  movieSlug: String,
  readAt: { type: Date, default: null },
  dedupeKey: { type: String, required: true, unique: true },
}, { timestamps: true });
schema.index({ recipientId: 1, createdAt: -1, _id: -1 });
schema.index({ recipientId: 1, readAt: 1 });
export default mongoose.model("Notification", schema);
