import Notification from "../models/Notification.js";
import { emitNotification } from "./notificationSocket.js";
export async function notify(data) {
  if (data.recipientId.toString() === data.actorId.toString()) return;
  try {
    const result = await Notification.updateOne({ dedupeKey: data.dedupeKey }, { $setOnInsert: data }, { upsert: true, runValidators: true });
    if (result.upsertedCount) emitNotification(data.recipientId.toString(), result.upsertedId.toString());
  } catch (error) { if (error.code !== 11000) console.error("Notification persistence failed:", error.message); }
}
