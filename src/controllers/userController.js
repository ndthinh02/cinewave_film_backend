import Favorite from "../models/Favorite.js";
import WatchProgress from "../models/WatchProgress.js";
export async function favorites(req, res) {
  res.json({
    items: await Favorite.find({ userId: req.user.id }).sort({ createdAt: -1 }),
  });
}
export async function addFavorite(req, res) {
  try {
    const f = await Favorite.findOneAndUpdate(
      { userId: req.user.id, movieSlug: req.body.movieSlug },
      { $set: { ...req.body, userId: req.user.id } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.json({ item: f });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}
export async function removeFavorite(req, res) {
  await Favorite.deleteOne({ userId: req.user.id, movieSlug: req.params.slug });
  res.json({ ok: true });
}
export async function progressList(req, res) {
  res.json({
    items: await WatchProgress.find({ userId: req.user.id })
      .sort({ lastWatchedAt: -1 })
      .limit(100),
  });
}
export async function saveProgress(req, res, next) {
  const body = req.body ?? {};

  if (
    typeof body.movieSlug !== "string" ||
    !body.movieSlug.trim() ||
    typeof body.episodeSlug !== "string" ||
    !body.episodeSlug.trim() ||
    !Number.isInteger(body.positionSeconds) ||
    body.positionSeconds < 0 ||
    !Number.isInteger(body.durationSeconds) ||
    body.durationSeconds <= 0 ||
    (body.completed !== undefined && typeof body.completed !== "boolean")
  ) {
    return res.status(400).json({
      message: "Thông tin tiến độ xem không hợp lệ.",
    });
  }

  try {
    const item = await WatchProgress.findOneAndUpdate(
      {
        userId: req.user.id,
        movieSlug: body.movieSlug.trim(),
      },
      {
        $set: {
          movieName:
            typeof body.movieName === "string"
              ? body.movieName.slice(0, 300)
              : "",
          thumbUrl:
            typeof body.thumbUrl === "string"
              ? body.thumbUrl.slice(0, 2048)
              : "",
          episodeName:
            typeof body.episodeName === "string"
              ? body.episodeName.slice(0, 100)
              : "",
          episodeSlug: body.episodeSlug.trim(),
          positionSeconds: Math.min(body.positionSeconds, body.durationSeconds),
          durationSeconds: body.durationSeconds,
          completed: body.completed === true,
          lastWatchedAt: new Date(),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      },
    );

    return res.json({ item });
  } catch (error) {
    next(error);
  }
}
export async function clearHistory(req, res) {
  await WatchProgress.deleteMany({ userId: req.user.id });
  res.json({ ok: true });
}
