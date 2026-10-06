import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: true,
      maxlength: 80,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      required: true,
      maxlength: 254,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    avatarUrl: {
      type: String,
      default: '',
      maxlength: 2048,
    },

    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    watchingPrivacy: {type: String, enum: ['private', 'followers', 'public'], default: 'private'},
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('User', userSchema);
