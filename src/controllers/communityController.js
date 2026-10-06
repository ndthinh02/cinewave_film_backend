import mongoose from "mongoose";
import User from "../models/User.js";
import Follow from "../models/Follow.js";
import MovieReview from "../models/MovieReview.js";
import { readReviews } from "./reviewController.js";
import { notify } from "../services/notifications.js";

export async function requireCommunityUser(req, res, next) {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.userId)) return res.status(400).json({ message: "Người dùng không hợp lệ." });
    const user = await User.findById(req.params.userId).select("name avatarUrl createdAt").lean();
    if (!user) return res.status(404).json({ message: "Người dùng không tồn tại." });
    req.communityUser = user;
    return next();
  } catch (error) { return next(error); }
}
export async function publicProfile(req, res, next) {
  try {
    const id = req.communityUser._id;
    const [followersCount, followingCount, reviewCount, following] = await Promise.all([
      Follow.countDocuments({ followingId: id }), Follow.countDocuments({ followerId: id }),
      MovieReview.countDocuments({ userId: id }), req.user ? Follow.exists({ followerId: req.user.id, followingId: id }) : false,
    ]);
    res.set("Cache-Control", "no-store");
    return res.json({ id, name: req.communityUser.name, avatar: req.communityUser.avatarUrl,
      joinedAt: req.communityUser.createdAt, reviewCount, followersCount, followingCount,
      isFollowing: Boolean(following), isMe: req.user?.id === id.toString() });
  } catch (error) { return next(error); }
}
export async function followUser(req, res, next) {
  try {
    if (req.user.id === req.communityUser._id.toString()) return res.status(400).json({ message: "Không thể theo dõi chính mình." });
    const filter = { followerId: req.user.id, followingId: req.communityUser._id };
    try {
      const result = await Follow.updateOne(filter, { $setOnInsert: filter }, { upsert: true, runValidators: true });
      if (result.upsertedCount) await notify({ recipientId: req.communityUser._id, actorId: req.user.id, type: "follow", dedupeKey: `follow:${result.upsertedId}` });
    }
    catch (error) { if (error.code !== 11000) throw error; }
    return publicProfile(req, res, next);
  } catch (error) { return next(error); }
}
export async function unfollowUser(req, res, next) {
  try {
    await Follow.deleteOne({ followerId: req.user.id, followingId: req.communityUser._id });
    return publicProfile(req, res, next);
  } catch (error) { return next(error); }
}
export async function userReviews(req, res, next) {
  try {
    res.set("Cache-Control", "no-store");
    const { page, limit } = req.reviewPagination;
    return res.json(await readReviews(null, page, limit, req.user?.id, false, { userId: req.communityUser._id }));
  } catch (error) { return next(error); }
}

export async function communityFeed(req, res, next) {
  try {
    const { page, limit } = req.reviewPagination;
    let filter = {};
    if (req.path === "/feed/following") {
      const users = await Follow.distinct("followingId", { followerId: req.user.id });
      filter = { userId: { $in: users } };
    }
    res.set("Cache-Control", "no-store");
    return res.json(await readReviews(null, page, limit, req.user?.id, false, filter));
  } catch (error) { return next(error); }
}
export async function reviewById(req, res, next) {
  try {
    res.set("Cache-Control", "no-store");
    const result = await readReviews(null, 1, 1, req.user?.id, false, { _id: new mongoose.Types.ObjectId(req.params.reviewId) });
    return res.json({ item: result.items[0] ?? null });
  } catch (error) { return next(error); }
}
