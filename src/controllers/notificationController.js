import mongoose from "mongoose";
import Notification from "../models/Notification.js";
export async function notifications(req, res, next) {
  try {
    const { page, limit } = req.reviewPagination;
    const filter = { recipientId: req.user.id };
    const [items, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)
        .select("actorId type reviewId commentId movieSlug readAt createdAt").populate("actorId", "name avatarUrl").lean(),
      Notification.countDocuments(filter),
    ]);
    res.set("Cache-Control", "no-store");
    return res.json({ items: items.map((item) => ({ id: item._id, type: item.type,
      actor: item.actorId ? { id: item.actorId._id, name: item.actorId.name, avatar: item.actorId.avatarUrl } : null,
      reviewId: item.reviewId, commentId: item.commentId, movieSlug: item.movieSlug,
      readAt: item.readAt, createdAt: item.createdAt })), page, limit, total, hasMore: page * limit < total });
  } catch (error) { return next(error); }
}
export async function unreadCount(req, res, next) {
  try { res.set("Cache-Control", "no-store"); return res.json({ count: await Notification.countDocuments({ recipientId: req.user.id, readAt: null }) }); }
  catch (error) { return next(error); }
}
export async function markRead(req, res, next) {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.notificationId)) return res.status(400).json({ message: "Thông báo không hợp lệ." });
    const item = await Notification.findOneAndUpdate({ _id: req.params.notificationId, recipientId: req.user.id }, { $set: { readAt: new Date() } });
    if (!item) return res.status(404).json({ message: "Không tìm thấy thông báo." });
    return res.json({ ok: true });
  } catch (error) { return next(error); }
}
export async function markAllRead(req, res, next) {
  try { await Notification.updateMany({ recipientId: req.user.id, readAt: null }, { $set: { readAt: new Date() } }); return res.json({ ok: true }); }
  catch (error) { return next(error); }
}
