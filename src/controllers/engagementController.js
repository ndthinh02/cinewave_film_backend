import mongoose from "mongoose";
import MovieReview from "../models/MovieReview.js";
import ReviewComment from "../models/ReviewComment.js";
import ReviewReaction, { reactionTypes } from "../models/ReviewReaction.js";
import User from "../models/User.js";
import { notify } from "../services/notifications.js";

const oid = (value) => new mongoose.Types.ObjectId(value);
const fail = (res, status, code, message) => res.status(status).json({ code, message });

export async function engagementFor(ids, viewerId) {
  if (!ids.length) return new Map();
  const reviewIds = ids.map(oid);
  const viewer = viewerId ? oid(viewerId) : null;
  const [reactions, comments] = await Promise.all([
    ReviewReaction.aggregate([
      { $match: { reviewId: { $in: reviewIds } } },
      { $group: { _id: { reviewId: "$reviewId", type: "$type" }, count: { $sum: 1 },
        mine: { $max: { $cond: [{ $eq: ["$userId", viewer] }, 1, 0] } } } },
    ]),
    ReviewComment.aggregate([
      { $match: { reviewId: { $in: reviewIds }, isDeleted: false } },
      { $group: { _id: "$reviewId", count: { $sum: 1 } } },
    ]),
  ]);
  const result = new Map(ids.map((id) => [id.toString(), { reactionCounts: Object.fromEntries(reactionTypes.map((type) => [type, 0])), commentCount: 0, myReaction: null }]));
  for (const entry of reactions) {
    const value = result.get(entry._id.reviewId.toString());
    value.reactionCounts[entry._id.type] = entry.count;
    if (entry.mine) value.myReaction = entry._id.type;
  }
  for (const entry of comments) result.get(entry._id.toString()).commentCount = entry.count;
  return result;
}

export async function requireReview(req, res, next) {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.reviewId)) return fail(res, 400, "INVALID_REVIEW_ID", "Review không hợp lệ.");
    req.params.reviewId = oid(req.params.reviewId).toString();
    if (!await MovieReview.exists({ _id: req.params.reviewId })) return fail(res, 404, "REVIEW_NOT_FOUND", "Review đã bị xóa.");
    return next();
  } catch (error) { return next(error); }
}

export async function requireComment(req, res, next) {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.commentId)) return fail(res, 400, "INVALID_COMMENT_ID", "Bình luận không hợp lệ.");
    const comment = await ReviewComment.findById(req.params.commentId).lean();
    if (!comment || !await MovieReview.exists({ _id: comment.reviewId })) return fail(res, 404, "COMMENT_NOT_FOUND", "Bình luận hoặc review đã bị xóa.");
    req.comment = comment;
    req.params.reviewId = comment.reviewId.toString();
    return next();
  } catch (error) { return next(error); }
}

export function rootOnly(req, res, next) {
  if (req.comment.parentCommentId) return fail(res, 400, "REPLY_DEPTH", "Chỉ hỗ trợ trả lời bình luận gốc.");
  return next();
}

export function validateContent(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "content") ||
      typeof body.content !== "string" || !body.content.trim() || body.content.length > 2000) {
    return fail(res, 400, "INVALID_CONTENT", "Bình luận cần từ 1 đến 2000 ký tự; chỉ gửi content.");
  }
  return next();
}

export async function getEngagement(req, res, next) {
  try {
    res.set("Cache-Control", "no-store");
    const result = await engagementFor([req.params.reviewId], req.user?.id);
    return res.json(result.get(req.params.reviewId));
  } catch (error) { return next(error); }
}

export async function putReaction(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "type") || !reactionTypes.includes(body.type)) {
    return fail(res, 400, "INVALID_REACTION", "Reaction không hợp lệ; chỉ gửi type.");
  }
  const filter = { reviewId: req.params.reviewId, userId: req.user.id };
  const update = { $set: { type: body.type } };
  try {
    try {
      await ReviewReaction.findOneAndUpdate(filter, update, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      await ReviewReaction.findOneAndUpdate(filter, update, { runValidators: true });
    }
    const review = await MovieReview.findById(req.params.reviewId).select("userId movieSlug").lean();
    if (review) await notify({ recipientId: review.userId, actorId: req.user.id, type: "reaction", reviewId: review._id,
      movieSlug: review.movieSlug, dedupeKey: `reaction:${review._id}:${req.user.id}` });
    return getEngagement(req, res, next);
  } catch (error) { return next(error); }
}

export async function deleteReaction(req, res, next) {
  try {
    await ReviewReaction.deleteOne({ reviewId: req.params.reviewId, userId: req.user.id });
    return getEngagement(req, res, next);
  } catch (error) { return next(error); }
}

async function commentsPage(reviewId, parentId, viewerId, page, limit, commentId) {
  const viewer = viewerId ? oid(viewerId) : null;
  const [result] = await ReviewComment.aggregate([
    { $match: { reviewId: oid(reviewId), ...(commentId ? { _id: oid(commentId) } : { parentCommentId: parentId ? oid(parentId) : null }) } },
    { $sort: { createdAt: 1, _id: 1 } },
    { $facet: {
      count: [{ $count: "total" }],
      items: [
        { $skip: (page - 1) * limit }, { $limit: limit },
        { $lookup: { from: User.collection.name, localField: "userId", foreignField: "_id", pipeline: [{ $project: { name: 1, avatarUrl: 1 } }], as: "author" } },
        { $lookup: { from: ReviewComment.collection.name, let: { parent: "$_id" },
          pipeline: [{ $match: { $expr: { $eq: ["$parentCommentId", "$$parent"] }, isDeleted: false } }, { $count: "total" }], as: "replies" } },
        { $project: {
          _id: 0, id: { $toString: "$_id" }, reviewId: { $toString: "$reviewId" },
          parentCommentId: { $cond: [{ $eq: ["$parentCommentId", null] }, null, { $toString: "$parentCommentId" }] },
          content: 1, isDeleted: 1, createdAt: 1, updatedAt: 1,
          replyCount: { $ifNull: [{ $arrayElemAt: ["$replies.total", 0] }, 0] },
          isMine: { $and: [{ $eq: ["$userId", viewer] }, { $eq: ["$isDeleted", false] }] },
          user: { id: { $toString: "$userId" },
            name: { $ifNull: [{ $arrayElemAt: ["$author.name", 0] }, "Người dùng"] },
            avatar: { $ifNull: [{ $arrayElemAt: ["$author.avatarUrl", 0] }, ""] } },
        } },
      ],
    } },
  ]);
  const total = result?.count[0]?.total ?? 0;
  return { items: result?.items ?? [], page, limit, total, hasMore: page * limit < total };
}

export async function listComments(req, res, next) {
  try {
    res.set("Cache-Control", "no-store");
    const { page, limit } = req.reviewPagination;
    return res.json(await commentsPage(req.params.reviewId, req.comment?._id.toString(), req.user?.id, page, limit));
  } catch (error) { return next(error); }
}

async function commentResult(req, res, next, id) {
  const result = await commentsPage(req.params.reviewId, null, req.user.id, 1, 1, id.toString());
  const summary = await engagementFor([req.params.reviewId], req.user.id);
  return res.json({ item: result.items[0], engagement: summary.get(req.params.reviewId) });
}

export async function createComment(req, res, next) {
  try {
    if (req.comment?.isDeleted) return fail(res, 404, "COMMENT_DELETED", "Bình luận gốc đã bị xóa.");
    const item = await ReviewComment.create({
      reviewId: req.params.reviewId, userId: req.user.id,
      content: req.body.content.trim(), parentCommentId: req.comment?._id ?? null,
    });
    const review = await MovieReview.findById(req.params.reviewId).select("userId movieSlug").lean();
    if (review) await notify({ recipientId: req.comment?.userId ?? review.userId, actorId: req.user.id,
      type: req.comment ? "reply" : "comment", reviewId: review._id, commentId: item._id,
      movieSlug: review.movieSlug, dedupeKey: `comment:${item._id}` });
    return await commentResult(req, res, next, item._id);
  } catch (error) { return next(error); }
}

export async function editComment(req, res, next) {
  try {
    const item = await ReviewComment.findOneAndUpdate({ _id: req.comment._id, userId: req.user.id, isDeleted: false },
      { $set: { content: req.body.content.trim() } }, { new: true, runValidators: true });
    if (!item) return fail(res, 403, "NOT_OWNER", "Bạn chỉ có thể sửa bình luận của mình.");
    return await commentResult(req, res, next, item._id);
  } catch (error) { return next(error); }
}

export async function deleteComment(req, res, next) {
  try {
    if (req.comment.userId.toString() !== req.user.id) return fail(res, 403, "NOT_OWNER", "Bạn chỉ có thể xóa bình luận của mình.");
    if (req.comment.parentCommentId) {
      await ReviewComment.deleteOne({ _id: req.comment._id, userId: req.user.id });
    } else {
      // Giữ mốc hội thoại để reply của người khác không mất khi xóa parent.
      await ReviewComment.updateOne({ _id: req.comment._id, userId: req.user.id }, { $set: { content: "Bình luận đã xóa", isDeleted: true } });
    }
    const result = await engagementFor([req.params.reviewId], req.user.id);
    return res.json({ ok: true, engagement: result.get(req.params.reviewId) });
  } catch (error) { return next(error); }
}
