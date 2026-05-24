/**
 * Vercel serverless entry point.
 *
 * Vercel auto-detects any file under /api as a serverless function. We funnel
 * EVERY incoming request to the Express app (see vercel.json rewrite). The
 * Express app itself never calls listen() in this mode — Vercel invokes the
 * default-exported handler per request.
 *
 * Mongo connection caching: on a hot container the connection object is
 * reused; only on a cold start do we open a fresh one. Without this each
 * invocation would dial Atlas afresh — slow and blows past Atlas's
 * connection limit fast.
 */

import mongoose from 'mongoose';
import app from '../src/app.js';

let connectionPromise = null;

const ensureDb = async () => {
    if (mongoose.connection.readyState === 1) return;
    if (!connectionPromise) {
        connectionPromise = mongoose
            .connect(process.env.MONGODB_URL, {
                bufferCommands: false,
                serverSelectionTimeoutMS: 8000,
                maxPoolSize: 5,
            })
            .catch((err) => {
                connectionPromise = null;
                throw err;
            });
    }
    await connectionPromise;
};

export default async function handler(req, res) {
    try {
        await ensureDb();
    } catch (err) {
        console.error('Mongo connect failed:', err.message);
        res.status(503).json({ status: 'Error', message: 'Database unavailable' });
        return;
    }
    return app(req, res);
}
