import mongoose from "mongoose";
import MovieReview from "../models/MovieReview.js";
import MovieRating from "../models/MovieRating.js";
import User from "../models/User.js";
import ReviewComment from "../models/ReviewComment.js";
import ReviewReaction from "../models/ReviewReaction.js";
import { engagementFor } from "./engagementController.js";

export function validateReview(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["content", "hasSpoiler"].includes(key)) ||
      typeof body.content !== "string" || !body.content.trim() ||
      body.content.length > 2000 ||
      (body.hasSpoiler !== undefined && typeof body.hasSpoiler !== "boolean")) {
    return res.status(400).json({ code: "INVALID_REVIEW", message: "Review cần có nội dung từ 1 đến 2000 ký tự và cờ spoiler hợp lệ." });
  }
  return next();
}

export function validatePagination(req, res, next) {
  const positiveInteger = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed <= max ? parsed : null;
  };
  const page = positiveInteger(req.query.page, 1, 10000);
  const limit = positiveInteger(req.query.limit, 10, 50);
  if (page === null || limit === null) {
    return res.status(400).json({ code: "INVALID_PAGINATION", message: "Page phải từ 1 đến 10000; limit từ 1 đến 50." });
  }
  req.reviewPagination = { page, limit };
  return next();
}

export async function readReviews(slug, page, limit, viewerId, ownOnly = false, filter = {}) {
  const viewer = viewerId ? new mongoose.Types.ObjectId(viewerId) : null;
  const [result] = await MovieReview.aggregate([
    { $match: { ...(slug ? { movieSlug: slug } : {}), ...(ownOnly ? { userId: viewer } : {}), ...filter } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $facet: {
      count: [{ $count: "total" }],
      items: [
        { $skip: (page - 1) * limit }, { $limit: limit },
        { $lookup: {
          from: User.collection.name, localField: "userId", foreignField: "_id",
          pipeline: [{ $project: { name: 1, avatarUrl: 1 } }], as: "author",
        } },
        { $lookup: {
          from: MovieRating.collection.name,
          let: { authorId: "$userId", slug: "$movieSlug" },
          pipeline: [
            { $match: { $expr: { $and: [
              { $eq: ["$userId", "$$authorId"] }, { $eq: ["$movieSlug", "$$slug"] },
            ] } } }, { $project: { _id: 0, score: 1 } },
          ], as: "scores",
        } },
        { $project: {
          _id: 0, id: { $toString: "$_id" }, movieSlug: 1, content: 1,
          hasSpoiler: 1, createdAt: 1, updatedAt: 1,
          user: {
            id: { $toString: "$userId" },
            name: { $ifNull: [{ $arrayElemAt: ["$author.name", 0] }, "Người dùng"] },
            avatar: { $ifNull: [{ $arrayElemAt: ["$author.avatarUrl", 0] }, ""] },
          },
          rating: { $ifNull: [{ $arrayElemAt: ["$scores.score", 0] }, null] },
          isMine: { $eq: ["$userId", viewer] },
        } },
      ],
    } },
  ]);
  const total = result?.count[0]?.total ?? 0;
  const items = result?.items ?? [];
  const engagement = await engagementFor(items.map((item) => item.id), viewerId);
  return { items: items.map((item) => ({ ...item, ...engagement.get(item.id) })), page, limit, hasMore: page * limit < total, total };
}

export async function listReviews(req, res, next) {
  try {
    res.set("Cache-Control", "no-store");
    const { page, limit } = req.reviewPagination;
    return res.json(await readReviews(req.params.slug, page, limit, req.user?.id));
  } catch (error) { return next(error); }
}

export async function myReview(req, res, next) {
  try {
    res.set("Cache-Control", "no-store");
    const result = await readReviews(req.params.slug, 1, 1, req.user.id, true);
    return res.json({ item: result.items[0] ?? null });
  } catch (error) { return next(error); }
}

export async function putReview(req, res, next) {
  const filter = { userId: req.user.id, movieSlug: req.params.slug };
  const update = { $set: { content: req.body.content.trim(), hasSpoiler: req.body.hasSpoiler ?? false } };
  try {
    try {
      await MovieReview.findOneAndUpdate(filter, update, {
        upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      await MovieReview.findOneAndUpdate(filter, update, { runValidators: true });
    }
    return myReview(req, res, next);
  } catch (error) { return next(error); }
}

export async function deleteReview(req, res, next) {
  try {
    const item = await MovieReview.findOneAndDelete({ userId: req.user.id, movieSlug: req.params.slug });
    if (item) await Promise.all([
      ReviewComment.deleteMany({ reviewId: item._id }),
      ReviewReaction.deleteMany({ reviewId: item._id }),
    ]);
    return res.json({ ok: true });
  } catch (error) { return next(error); }
}
