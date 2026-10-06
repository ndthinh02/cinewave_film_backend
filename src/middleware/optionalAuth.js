import { auth } from "./auth.js";

// Không có token là guest; token được gửi lên vẫn phải được xác minh.
export function optionalAuth(req, res, next) {
  if (req.headers.authorization === undefined) return next();
  return auth(req, res, next);
}
