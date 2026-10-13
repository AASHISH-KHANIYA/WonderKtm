// Vercel serverless entry: runs the Express API built from server/src.
import { createApp } from '../server/dist/app.js';
import { connectDb } from '../server/dist/config/db.js';

let app;
let ready;

export default async function handler(req, res) {
  ready ??= connectDb().catch((e) => { ready = undefined; throw e; });
  await ready;
  app ??= createApp();
  return app(req, res);
}
