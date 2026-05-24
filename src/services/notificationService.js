import Notification from '../models/Notification.js';

export const notify = async (userId, { type, title, body = '', data = {} }) => {
    if (!userId || !type || !title) return null;
    try {
        return await Notification.create({ user: userId, type, title, body, data });
    } catch (err) {
        console.error('notify failed:', err.message);
        return null;
    }
};

export const notifyMany = (userIds, payload) =>
    Promise.all(userIds.map((id) => notify(id, payload)));
