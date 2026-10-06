import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
let io;
export async function attachNotificationSocket(server) {
  try {
    const { Server } = await import("socket.io");
    io = new Server(server, { cors: { origin: "*" }, transports: ["websocket"] });
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        if (typeof token !== "string") throw new Error("AUTH_REQUIRED");
        const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
        if (typeof payload !== "object" || !mongoose.isObjectIdOrHexString(payload.id) || !await User.exists({ _id: payload.id })) throw new Error("INVALID_TOKEN");
        socket.data.userId = new mongoose.Types.ObjectId(payload.id).toString();
        socket.data.expiresAt = payload.exp;
        next();
      } catch (_) { next(new Error("AUTH_REQUIRED")); }
    });
    io.on("connection", (socket) => {
      socket.join(`user:${socket.data.userId}`);
      const remaining = (socket.data.expiresAt * 1000) - Date.now();
      const timer = setTimeout(() => socket.disconnect(true), Math.min(Math.max(remaining, 0), 2147483647));
      socket.on("disconnect", () => clearTimeout(timer));
    });
  } catch (error) {
    console.warn("Notification socket unavailable; REST remains active:", error.code ?? error.message);
  }
}
export function emitNotification(userId, id) { io?.to(`user:${userId}`).emit("notification", { id }); }
