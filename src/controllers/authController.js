import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import User from "../models/User.js";

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
  };
}

function signToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: process.env.JWT_EXPIRES_IN || "30d",
    },
  );
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 6 &&
    Buffer.byteLength(password, "utf8") <= 72
  );
}

function serverError(res, error) {
  // Chi tiết lỗi chỉ ghi ở server.
  console.error("[auth]", error);

  return res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "Lỗi máy chủ. Vui lòng thử lại sau.",
  });
}

export async function register(req, res) {
  const body = req.body ?? {};

  const name = typeof body.name === "string" ? body.name.trim() : "";

  const email = normalizeEmail(body.email);
  const password = body.password;

  if (!name || name.length > 80) {
    return res.status(400).json({
      code: "INVALID_NAME",
      message: "Tên hiển thị phải có từ 1 đến 80 ký tự.",
    });
  }

  if (!validEmail(email)) {
    return res.status(400).json({
      code: "INVALID_EMAIL",
      message: "Email không đúng định dạng.",
    });
  }

  if (!validPassword(password)) {
    return res.status(400).json({
      code: "INVALID_PASSWORD",
      message: "Mật khẩu phải có ít nhất 6 ký tự và không vượt quá 72 byte.",
    });
  }

  try {
    if (await User.exists({ email })) {
      return res.status(409).json({
        code: "EMAIL_EXISTS",
        message: "Email đã được sử dụng.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      passwordHash,
      role: "user",
    });

    return res.status(201).json({
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    // Xử lý cả trường hợp hai yêu cầu đăng ký cùng email
    // đến gần như đồng thời.
    if (error.code === 11000) {
      return res.status(409).json({
        code: "EMAIL_EXISTS",
        message: "Email đã được sử dụng.",
      });
    }

    return serverError(res, error);
  }
}

export async function login(req, res) {
  const body = req.body ?? {};

  const email = normalizeEmail(body.email);
  const password = body.password;

  if (
    !validEmail(email) ||
    typeof password !== "string" ||
    password.length === 0 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({
      code: "INVALID_INPUT",
      message: "Vui lòng nhập email và mật khẩu hợp lệ.",
    });
  }

  try {
    const user = await User.findOne({ email }).select("+passwordHash");

    const matched = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!matched) {
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "Email hoặc mật khẩu không đúng.",
      });
    }

    return res.json({
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    return serverError(res, error);
  }
}

export async function me(req, res) {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(401).json({
        code: "ACCOUNT_NOT_FOUND",
        message: "Tài khoản không còn tồn tại. Vui lòng đăng nhập lại.",
      });
    }

    return res.json({
      user: publicUser(user),
    });
  } catch (error) {
    return serverError(res, error);
  }
}
