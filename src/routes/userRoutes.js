import { Router } from "express";
import { auth } from "../middleware/auth.js";
import {
  favorites,
  addFavorite,
  removeFavorite,
  progressList,
  saveProgress,
  clearHistory,
} from "../controllers/userController.js";
import {
  receiveAvatar,
  updateAvatar,
} from "../controllers/avatarController.js";

const r = Router();
r.use(auth);
r.get("/favorites", favorites);
r.post("/favorites", addFavorite);
r.delete("/favorites/:slug", removeFavorite);
r.get("/history", progressList);
r.put("/progress", saveProgress);
r.delete("/history", clearHistory);
r.put("/avatar", receiveAvatar, updateAvatar);
export default r;
