/**
 * Notification service.
 *
 * Notifications are SIDE EFFECTS of business actions (race finished, payout,
 * gift redeem, ...). We intentionally swallow errors here so a failed insert
 * never blocks the action that triggered it. If notifications start losing
 * messages silently, look at the console.error stream first.
 *
 * `data` is an opaque blob the frontend can read to deep-link into a screen
 * (e.g. raceId so a "Race finished" notification can navigate to the race).
 */

import Notification from '../models/Notification.js';

/** Publish one notification. Returns the doc on success, null on failure. */
export const notify = async (userId, { type, title, body = '', data = {} }) => {
    if (!userId || !type || !title) return null;
    try {
        return await Notification.create({ user: userId, type, title, body, data });
    } catch (err) {
        console.error('notify failed:', err.message);
        return null;
    }
};

/** Fan-out the same payload to many users in parallel (e.g. broadcast). */
export const notifyMany = (userIds, payload) =>
    Promise.all(userIds.map((id) => notify(id, payload)));
