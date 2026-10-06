import mongoose from "mongoose";
import { movieSlugPattern } from "./MovieRating.js";

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  movieSlug: { type: String, required: true, maxlength: 200, match: movieSlugPattern },
  content: { type: String, required: true, trim: true, maxlength: 2000 },
  hasSpoiler: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ userId: 1, movieSlug: 1 }, { unique: true });
schema.index({ movieSlug: 1, createdAt: -1, _id: -1 });
schema.index({ userId: 1, createdAt: -1, _id: -1 });
schema.index({ createdAt: -1, _id: -1 });
export default mongoose.model("MovieReview", schema);
