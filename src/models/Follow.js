import mongoose from "mongoose";
const schema = new mongoose.Schema({
  followerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  followingId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
schema.index({ followerId: 1, followingId: 1 }, { unique: true });
schema.index({ followingId: 1 });
export default mongoose.model("Follow", schema);
