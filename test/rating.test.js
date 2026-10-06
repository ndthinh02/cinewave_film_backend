import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import MovieRating from "../src/models/MovieRating.js";
import User from "../src/models/User.js";
import communityRoutes from "../src/routes/communityRoutes.js";

test("rating schema rejects fractional/out-of-range scores and has unique ownership index", () => {
  for (const score of [0, 11, 1.5]) {
    assert.ok(new MovieRating({ userId: "000000000000000000000001", movieSlug: "test-movie", score }).validateSync());
  }
  assert.equal(new MovieRating({ userId: "000000000000000000000001", movieSlug: "test-movie", score: 10 }).validateSync(), undefined);
  assert.ok(MovieRating.schema.indexes().some(([fields, options]) => fields.userId === 1 && fields.movieSlug === 1 && options.unique));
});

test("HTTP rating contracts, validation, auth, isolation and retry", async (t) => {
  const rows = new Map();
  const originals = {
    user: User.findById, aggregate: MovieRating.aggregate,
    update: MovieRating.findOneAndUpdate, delete: MovieRating.deleteOne,
  };
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "rating-test-secret-only";
  const userA = "000000000000000000000001";
  const userB = "000000000000000000000002";
  User.findById = (id) => ({ select: async () => ({ _id: id, role: "user" }) });
  MovieRating.findOneAndUpdate = async (filter, update) => {
    rows.set(`${filter.userId}:${filter.movieSlug}`, { ...filter, score: update.$set.score });
  };
  MovieRating.deleteOne = async (filter) => rows.delete(`${filter.userId}:${filter.movieSlug}`);
  MovieRating.aggregate = async (pipeline) => {
    const values = [...rows.values()].filter((row) => row.movieSlug === pipeline[0].$match.movieSlug);
    if (!values.length) return [];
    const mine = pipeline[1].$group.myRating.$max.$cond[0].$eq[1]?.toString();
    return [{ averageRating: values.reduce((sum, row) => sum + row.score, 0) / values.length,
      ratingCount: values.length, myRating: values.find((row) => row.userId === mine)?.score ?? null }];
  };
  const app = express();
  app.use(express.json());
  app.use("/api/community", communityRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    User.findById = originals.user;
    MovieRating.aggregate = originals.aggregate;
    MovieRating.findOneAndUpdate = originals.update;
    MovieRating.deleteOne = originals.delete;
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;
    await new Promise((resolve) => server.close(resolve));
  });
  const root = `http://127.0.0.1:${server.address().port}/api/community/movies`;
  const request = async (path, method = "GET", user, body, token) => {
    const response = await fetch(`${root}/${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(user || token ? {
        Authorization: `Bearer ${token ?? jwt.sign({ id: user }, process.env.JWT_SECRET)}`,
      } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  assert.deepEqual(await request("test-movie/summary"), { status: 200, body: { averageRating: null, ratingCount: 0 } });
  assert.equal((await request("test-movie/rating", "PUT", undefined, { score: 8 })).status, 401);
  assert.equal((await request("test-movie/rating", "DELETE")).status, 401);
  assert.equal((await request("test-movie/summary", "GET", undefined, undefined, "invalid")).status, 401);
  assert.equal((await request("bad_slug/summary")).status, 400);
  for (const body of [{ score: 0 }, { score: 11 }, { score: 8.5 }, { score: "8" }, {}, { score: 8, userId: userB }]) {
    assert.equal((await request("test-movie/rating", "PUT", userA, body)).status, 400);
  }
  assert.deepEqual((await request("test-movie/rating", "PUT", userA, { score: 8 })).body,
    { averageRating: 8, ratingCount: 1, myRating: 8 });
  await request("test-movie/rating", "PUT", userA, { score: 8 });
  assert.equal(rows.size, 1);
  await request("test-movie/rating", "PUT", userB, { score: 10 });
  assert.deepEqual((await request("test-movie/rating", "PUT", userA, { score: 6 })).body,
    { averageRating: 8, ratingCount: 2, myRating: 6 });
  assert.deepEqual((await request("test-movie/summary")).body, { averageRating: 8, ratingCount: 2 });
  assert.equal((await request("test-movie/summary", "GET", userB)).body.myRating, 10);
  assert.deepEqual((await request("test-movie/rating", "DELETE", userA)).body,
    { averageRating: 10, ratingCount: 1, myRating: null });
  await request("test-movie/rating", "DELETE", userA);
  assert.equal(rows.size, 1);
  await request("test-movie/rating", "DELETE", userB);
  assert.equal((await request("test-movie/summary")).body.ratingCount, 0);
  const originalUpdate = MovieRating.findOneAndUpdate;
  let attempts = 0;
  MovieRating.findOneAndUpdate = async (...args) => {
    if (attempts++ === 0) throw Object.assign(new Error("duplicate"), { code: 11000 });
    return originalUpdate(...args);
  };
  assert.equal((await request("test-movie/rating", "PUT", userA, { score: 9 })).status, 200);
  assert.equal(attempts, 2);
});
