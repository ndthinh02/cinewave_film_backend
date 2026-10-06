import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import User from "../models/User.js";

export async function auth(req, res, next) {
  const header = req.headers.authorization;

  const match =
    typeof header === "string" ? header.match(/^Bearer\s+(\S+)$/i) : null;

  if (!match) {
    return res.status(401).json({
      code: "AUTH_REQUIRED",
      message: "Vui lòng đăng nhập để tiếp tục.",
    });
  }

  let payload;

  try {
    payload = jwt.verify(match[1], process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch (error) {
    return res.status(401).json({
      code:
        error.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
      message:
        error.name === "TokenExpiredError"
          ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
          : "Phiên đăng nhập không hợp lệ.",
    });
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.id !== "string" ||
    !mongoose.isObjectIdOrHexString(payload.id)
  ) {
    return res.status(401).json({
      code: "INVALID_TOKEN",
      message: "Phiên đăng nhập không hợp lệ.",
    });
  }

  try {
    const user = await User.findById(payload.id).select("_id email role");

    if (!user) {
      return res.status(401).json({
        code: "ACCOUNT_NOT_FOUND",
        message: "Tài khoản không còn tồn tại.",
      });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}
