import mongoose from "mongoose";
import MovieRating, { movieSlugPattern } from "../models/MovieRating.js";

export function validateMovieSlug(req, res, next) {
  const slug = req.params.slug;
  if (typeof slug !== "string" || slug.length > 200 || !movieSlugPattern.test(slug)) {
    return res.status(400).json({ code: "INVALID_MOVIE_SLUG", message: "Mã phim không hợp lệ." });
  }
  return next();
}

export function validateRating(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "score") ||
      !Number.isInteger(body.score) || body.score < 1 || body.score > 10) {
    return res.status(400).json({ code: "INVALID_RATING", message: "Chỉ gửi điểm nguyên từ 1 đến 10." });
  }
  return next();
}

export async function readSummary(slug, userId) {
  // Một aggregate cho tổng điểm và điểm cá nhân, không dùng counter rời.
  const mine = userId ? new mongoose.Types.ObjectId(userId) : null;
  const [result] = await MovieRating.aggregate([
    { $match: { movieSlug: slug } },
    { $group: {
      _id: null,
      averageRating: { $avg: "$score" },
      ratingCount: { $sum: 1 },
      myRating: { $max: { $cond: [{ $eq: ["$userId", mine] }, "$score", null] } },
    } },
  ]);
  return {
    averageRating: result ? Math.round(result.averageRating * 10) / 10 : null,
    ratingCount: result?.ratingCount ?? 0,
    ...(userId ? { myRating: result?.myRating ?? null } : {}),
  };
}

export async function summary(req, res, next) {
  try {
    res.set("Cache-Control", "no-store");
    return res.json(await readSummary(req.params.slug, req.user?.id));
  } catch (error) { return next(error); }
}

export async function putRating(req, res, next) {
  const filter = { userId: req.user.id, movieSlug: req.params.slug };
  const update = { $set: { score: req.body.score } };
  try {
    try {
      await MovieRating.findOneAndUpdate(filter, update, {
        upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true,
      });
    } catch (error) {
      // Hai lần tạo đồng thời: unique index giữ một bản ghi, lần sau cập nhật nó.
      if (error.code !== 11000) throw error;
      await MovieRating.findOneAndUpdate(filter, update, { runValidators: true });
    }
    return res.json(await readSummary(req.params.slug, req.user.id));
  } catch (error) { return next(error); }
}

export async function deleteRating(req, res, next) {
  try {
    await MovieRating.deleteOne({ userId: req.user.id, movieSlug: req.params.slug });
    return res.json(await readSummary(req.params.slug, req.user.id));
  } catch (error) { return next(error); }
}
