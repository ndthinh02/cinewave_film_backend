import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import User from '../models/User.js';

export const avatarDirectory = fileURLToPath(
  new URL('../../uploads/avatars/', import.meta.url),
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 0,
  },
}).single('avatar');

export function receiveAvatar(req, res, next) {
  upload(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message: error.code === 'LIMIT_FILE_SIZE'
          ? 'Ảnh không được vượt quá 5 MB.'
          : 'Vui lòng gửi một ảnh với tên trường avatar.',
      });
    }

    next();
  });
}

export async function updateAvatar(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      message: 'Vui lòng chọn ảnh.',
    });
  }

  let image;

  try {
    image = await sharp(req.file.buffer, {
      limitInputPixels: 25000000,
    })
      .rotate()
      .resize(512, 512, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (_) {
    return res.status(400).json({
      message: 'Ảnh không hợp lệ hoặc kích thước ảnh quá lớn.',
    });
  }

  const filename = `${randomUUID()}.jpg`;
  const localPath = path.join(avatarDirectory, filename);

  try {
    await mkdir(avatarDirectory, { recursive: true });

    const { writeFile } = await import('node:fs/promises');
    await writeFile(localPath, image);

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          avatarUrl: `/uploads/avatars/${filename}`,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!user) {
      await unlink(localPath).catch(() => {});

      return res.status(401).json({
        message: 'Tài khoản không còn tồn tại.',
      });
    }

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
    });
  } catch (error) {
    await unlink(localPath).catch(() => {});
    next(error);
  }
}