import mongoose from "mongoose";

export const reactionTypes = ["like", "love", "haha", "wow", "sad", "fire"];
const schema = new mongoose.Schema({
  reviewId: { type: mongoose.Schema.Types.ObjectId, ref: "MovieReview", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: reactionTypes, required: true },
}, { timestamps: true });
schema.index({ reviewId: 1, userId: 1 }, { unique: true });
export default mongoose.model("ReviewReaction", schema);
