import mongoose from "mongoose";

export const movieSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    movieSlug: { type: String, required: true, maxlength: 200, match: movieSlugPattern },
    score: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
      validate: { validator: Number.isInteger, message: "Điểm phải là số nguyên." },
    },
  },
  { timestamps: true },
);
schema.index({ userId: 1, movieSlug: 1 }, { unique: true });
schema.index({ movieSlug: 1 });

export default mongoose.model("MovieRating", schema);
