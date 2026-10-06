import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";
import User from "../src/models/User.js";
import MovieReview from "../src/models/MovieReview.js";
import MovieRating from "../src/models/MovieRating.js";
import routes from "../src/routes/communityRoutes.js";

test("MovieReview schema: whitespace, length, spoiler default and unique index", () => {
  const data = { userId: new mongoose.Types.ObjectId(), movieSlug: "test-movie" };
  assert.ok(new MovieReview({ ...data, content: "   " }).validateSync());
  assert.ok(new MovieReview({ ...data, content: "a".repeat(2001) }).validateSync());
  assert.ok(new MovieReview({ ...data, movieSlug: "invalid_slug", content: "ok" }).validateSync());
  const review = new MovieReview({ ...data, content: "  good  " });
  assert.equal(review.content, "good");
  assert.equal(review.hasSpoiler, false);
  assert.ok(MovieReview.schema.indexes().some(([fields, options]) => fields.userId === 1 && fields.movieSlug === 1 && options.unique));
});

test("Review HTTP with real MongoDB", { skip: process.env.CINEWAVE_TEST_MONGO !== "1" }, async (t) => {
  const slug = `verification-${new mongoose.Types.ObjectId()}`;
  try {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "cinewave_review_verification", serverSelectionTimeoutMS: 2500 });
  } catch (_) {
    await mongoose.disconnect();
    t.skip("MongoDB unavailable: HTTP database integration not verified.");
    return;
  }
  const users = [];
  let server;
  t.after(async () => {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      await MovieReview.deleteMany({ movieSlug: slug });
      await MovieRating.deleteMany({ movieSlug: slug });
      await User.deleteMany({ _id: { $in: users.map((user) => user._id) } });
    } finally { await mongoose.disconnect(); }
  });
  await Promise.all([MovieReview.createIndexes(), MovieRating.createIndexes()]);
  users.push(await User.create({ name: "A", email: `${slug}-a@example.test`, passwordHash: "test-hash" }));
  users.push(await User.create({ name: "B", email: `${slug}-b@example.test`, passwordHash: "test-hash" }));
  const secret = process.env.JWT_SECRET || "review-test-secret";
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  t.after(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
  const app = express();
  app.use(express.json());
  app.use("/api/community", routes);
  app.use((err, req, res, next) => res.status(500).json({ message: err.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const request = async (suffix, method = "GET", user, body, explicitToken) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/community/movies/${slug}/${suffix}`, {
      method, headers: { "Content-Type": "application/json", ...(user || explicitToken ? {
        Authorization: `Bearer ${explicitToken ?? jwt.sign({ id: user._id.toString() }, secret)}`,
      } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const [a, b] = users;
  await t.test("guest list; auth required for mine/write/delete", async () => {
    assert.deepEqual((await request("reviews")).body, { items: [], page: 1, limit: 10, hasMore: false, total: 0 });
    assert.equal((await request("reviews/me")).status, 401);
    assert.equal((await request("review", "PUT", undefined, { content: "x" })).status, 401);
    assert.equal((await request("review", "DELETE")).status, 401);
    assert.equal((await request("reviews", "GET", undefined, undefined, "invalid")).status, 401);
    assert.equal((await request("reviews/me", "GET", a)).body.item, null);
  });
  await t.test("reject invalid content, spoiler, spoofed identity and pagination", async () => {
    for (const body of [{ content: "" }, { content: "  \n " }, { content: "x".repeat(2001) },
      { content: 123 }, { content: "ok", hasSpoiler: "true" }, { content: "ok", userId: b._id.toString() }]) {
      assert.equal((await request("review", "PUT", a, body)).status, 400);
    }
    for (const query of ["page=0", "page=-1", "page=1.5", "limit=0", "limit=51", "page=foo", "page=1&page=2"]) {
      assert.equal((await request(`reviews?${query}`)).status, 400);
    }
  });
  await t.test("create/trim and public DTO excludes private User fields", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      request("review", "PUT", a, { content: "  good movie  " })));
    const result = results[0];
    assert.ok(results.every((item) => item.status === 200));
    assert.equal(await MovieReview.countDocuments({ movieSlug: slug, userId: a._id }), 1);
    assert.equal(result.status, 200);
    assert.equal(result.body.item.content, "good movie");
    assert.equal(result.body.item.rating, null);
    assert.equal(result.body.item.hasSpoiler, false);
    assert.equal(result.body.item.isMine, true);
    const guest = (await request("reviews")).body.items[0];
    assert.equal(guest.isMine, false);
    assert.deepEqual(Object.keys(guest.user).sort(), ["avatar", "id", "name"]);
  });
  await t.test("update/spoiler and concurrent upserts do not duplicate", async () => {
    await Promise.all(Array.from({ length: 10 }, () => request("review", "PUT", a, { content: "spoiler", hasSpoiler: true })));
    assert.equal(await MovieReview.countDocuments({ movieSlug: slug, userId: a._id }), 1);
    assert.equal((await request("reviews/me", "GET", a)).body.item.hasSpoiler, true);
    await request("review", "PUT", a, { content: "edited", hasSpoiler: false });
    assert.equal((await request("reviews/me", "GET", a)).body.item.content, "edited");
  });
  await t.test("B cannot overwrite/delete A; identity is JWT-scoped", async () => {
    await request("review", "PUT", b, { content: "B review", hasSpoiler: true });
    await request("review", "DELETE", b, { userId: a._id.toString() });
    assert.equal((await request("reviews/me", "GET", a)).body.item.content, "edited");
    assert.equal((await request("review", "PUT", b, { content: "attack", userId: a._id.toString() })).status, 400);
    assert.equal((await request("reviews", "GET", b)).body.items[0].isMine, false);
  });
  await t.test("Rating and Review remain independent; returned score is current", async () => {
    await request("rating", "PUT", a, { score: 9 });
    assert.equal((await request("reviews/me", "GET", a)).body.item.rating, 9);
    await request("rating", "PUT", a, { score: 6 });
    assert.equal((await request("reviews/me", "GET", a)).body.item.rating, 6);
    await request("rating", "DELETE", a);
    assert.equal((await request("reviews/me", "GET", a)).body.item.content, "edited");
    assert.equal((await request("reviews/me", "GET", a)).body.item.rating, null);
    await request("rating", "PUT", a, { score: 8 });
    await request("review", "DELETE", a);
    assert.equal((await request("summary", "GET", a)).body.myRating, 8);
    assert.equal((await request("reviews/me", "GET", a)).body.item, null);
    assert.equal((await request("review", "DELETE", a)).status, 200);
  });
  await t.test("pagination: newest first, stable tie-breaker, no overlap, hasMore", async () => {
    await MovieReview.insertMany(Array.from({ length: 13 }, (_, index) => ({
      userId: new mongoose.Types.ObjectId(), movieSlug: slug, content: `review ${index}`,
      createdAt: new Date(1700000000000 + index * 1000),
    })));
    const first = (await request("reviews?page=1&limit=10")).body;
    const second = (await request("reviews?page=2&limit=10")).body;
    assert.equal(first.total, 13);
    assert.equal(first.hasMore, true);
    assert.equal(second.hasMore, false);
    assert.equal(first.items.length, 10);
    assert.equal(second.items.length, 3);
    assert.equal(first.items[0].content, "review 12");
    assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 13);
    assert.equal((await request("reviews?page=3")).body.items.length, 0);
  });
});
