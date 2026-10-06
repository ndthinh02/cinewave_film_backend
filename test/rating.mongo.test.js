import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import MovieRating from "../src/models/MovieRating.js";
import { putRating, deleteRating, readSummary } from "../src/controllers/ratingController.js";

test("MongoDB: concurrent upserts, average, ownership and idempotent delete", {
  skip: process.env.CINEWAVE_TEST_MONGO !== "1",
}, async (t) => {
  const slug = `verification-${new mongoose.Types.ObjectId()}`;
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "cinewave_rating_verification", serverSelectionTimeoutMS: 2500,
    });
  } catch (_) {
    await mongoose.disconnect();
    t.skip("MongoDB is not reachable; no real database verification performed.");
    return;
  }
  t.after(async () => {
    try { await MovieRating.deleteMany({ movieSlug: slug }); }
    finally { await mongoose.disconnect(); }
  });
  await MovieRating.createIndexes();
  const userA = new mongoose.Types.ObjectId().toString();
  const userB = new mongoose.Types.ObjectId().toString();
  const write = async (controller, user, score) => {
    let result;
    await controller({ params: { slug }, user: { id: user }, body: { score } },
      { json: (body) => { result = body; } }, (error) => { throw error; });
    return result;
  };
  await Promise.all(Array.from({ length: 12 }, () => write(putRating, userA, 8)));
  assert.equal(await MovieRating.countDocuments({ movieSlug: slug }), 1);
  await write(putRating, userB, 10);
  assert.deepEqual(await readSummary(slug, userA), { averageRating: 9, ratingCount: 2, myRating: 8 });
  await write(putRating, userA, 6);
  assert.deepEqual(await readSummary(slug), { averageRating: 8, ratingCount: 2 });
  await write(deleteRating, userA);
  await write(deleteRating, userA);
  assert.deepEqual(await readSummary(slug, userB), { averageRating: 10, ratingCount: 1, myRating: 10 });
  await write(deleteRating, userB);
  assert.deepEqual(await readSummary(slug, userA), { averageRating: null, ratingCount: 0, myRating: null });
});
