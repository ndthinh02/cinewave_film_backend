import mongoose from "mongoose";

const schema = new mongoose.Schema({
  reviewId: { type: mongoose.Schema.Types.ObjectId, ref: "MovieReview", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String, required: true, trim: true, maxlength: 2000 },
  parentCommentId: { type: mongoose.Schema.Types.ObjectId, ref: "ReviewComment", default: null },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ reviewId: 1, parentCommentId: 1, createdAt: 1, _id: 1 });
schema.index({ parentCommentId: 1, isDeleted: 1 });
export default mongoose.model("ReviewComment", schema);
