import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { createServer } from "node:http";
import { attachNotificationSocket } from "./services/notificationSocket.js";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import communityRoutes from "./routes/communityRoutes.js";
import { avatarDirectory } from "./controllers/avatarController.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.get("/api/health", (_, res) =>
  res.json({ ok: true, service: "cinewave-api" }),
);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/community", communityRoutes);
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Lỗi máy chủ" });
});
app.use(
  "/uploads/avatars",
  express.static(avatarDirectory, {
    dotfiles: "deny",
    maxAge: "1d",
  }),
);
const port = process.env.PORT || 8080;
connectDB()
  .then(async () => {
    // Hoàn tất unique index trước khi nhận request rating.
    const { default: MovieRating } = await import("./models/MovieRating.js");
    await MovieRating.createIndexes();
    const { default: MovieReview } = await import("./models/MovieReview.js");
    await MovieReview.createIndexes();
    const { default: Follow } = await import("./models/Follow.js");
    await Follow.createIndexes();
    const { default: ReviewComment } = await import("./models/ReviewComment.js");
    const { default: ReviewReaction } = await import("./models/ReviewReaction.js");
    await Promise.all([ReviewComment.createIndexes(), ReviewReaction.createIndexes()]);
    const { default: Notification } = await import("./models/Notification.js");
    await Notification.createIndexes();
    const { default: MovieCollection } = await import('./models/MovieCollection.js');
    await MovieCollection.createIndexes();
    const server = createServer(app);
    await attachNotificationSocket(server);
    server.listen(port, () => console.log(`API http://localhost:${port}`));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
