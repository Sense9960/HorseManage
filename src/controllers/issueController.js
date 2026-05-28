import mongoose from 'mongoose';
import Issue, { ISSUE_STATUSES } from '../models/Issue.js';
import { notify } from '../services/notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';
import { User, ROLES } from '../models/User.js';

const VALID_REPORTER_ROLES = ['Admin', 'Jockey', 'OwnerHorse', 'Referee', 'EndUser'];

// Any authenticated user creates an issue. Admins are notified.
export const createIssue = async (req, res) => {
    try {
        const { title, content, imageUrl } = req.body;
        if (!title || !content) {
            return res.status(400).send({ status: 'Error', message: 'title and content are required' });
        }
        const issue = await Issue.create({
            reporter: req.user._id,
            title: String(title).trim(),
            content: String(content).trim(),
            imageUrl,
        });

        // Notify all active admins.
        const admins = await User.find({ role: ROLES.ADMIN, status: 'Active' }).select('_id').lean();
        for (const a of admins) {
            await notify(a._id, {
                type: NOTIFICATION_TYPES.JOCKEY_HIRED, // reusing closest generic event type
                title: `New issue: ${issue.title}`,
                body: `From ${req.user.fullName || req.user.username} (${req.user.role})`,
                data: { issueId: issue._id, reporterId: req.user._id },
            });
        }

        return res.status(201).send({ status: 'Success', message: 'Issue submitted', data: issue });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const listMyIssues = async (req, res) => {
    try {
        const items = await Issue.find({ reporter: req.user._id }).sort({ createdAt: -1 });
        return res.status(200).send({ status: 'Success', message: 'My issues', data: items });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

// Admin endpoints below — same controller for simplicity.
// Admin list with filtering + pagination.
// Query params: status, fromDate, toDate, reporterRole, search, sort, limit, skip
export const adminListIssues = async (req, res) => {
    try {
        const { status, fromDate, toDate, reporterRole, search, sort = '-createdAt', limit = 50, skip = 0 } = req.query;
        const filter = {};
        if (status) filter.status = status;

        // Date range — inclusive on both ends if provided.
        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) {
                const f = new Date(fromDate);
                if (isNaN(f.getTime())) return res.status(400).send({ status: 'Error', message: 'fromDate invalid' });
                filter.createdAt.$gte = f;
            }
            if (toDate) {
                const t = new Date(toDate);
                if (isNaN(t.getTime())) return res.status(400).send({ status: 'Error', message: 'toDate invalid' });
                filter.createdAt.$lte = t;
            }
        }

        // Text search across title + content (case-insensitive).
        if (search) {
            const rx = new RegExp(String(search).trim(), 'i');
            filter.$or = [{ title: rx }, { content: rx }];
        }

        const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
        const safeSkip = Math.max(Number(skip) || 0, 0);
        const safeSort = ['-createdAt', 'createdAt', '-updatedAt', 'updatedAt'].includes(sort) ? sort : '-createdAt';

        // Filter by reporter role requires looking up users first.
        if (reporterRole) {
            if (!VALID_REPORTER_ROLES.includes(reporterRole)) {
                return res.status(400).send({ status: 'Error', message: 'Invalid reporterRole' });
            }
            const reporters = await User.find({ role: reporterRole }).select('_id').lean();
            filter.reporter = { $in: reporters.map((u) => u._id) };
        }

        const [items, total] = await Promise.all([
            Issue.find(filter)
                .sort(safeSort)
                .skip(safeSkip)
                .limit(safeLimit)
                .populate('reporter', 'fullName email role')
                .populate('handledBy', 'fullName email'),
            Issue.countDocuments(filter),
        ]);

        return res.status(200).send({
            status: 'Success',
            message: 'All issues',
            data: items,
            pagination: { total, limit: safeLimit, skip: safeSkip, returned: items.length },
        });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};

export const adminUpdateIssue = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send({ status: 'Error', message: 'Invalid issue ID' });
        }
        const { status, adminReply } = req.body;
        if (status && !ISSUE_STATUSES.includes(status)) {
            return res.status(400).send({
                status: 'Error',
                message: `status must be one of: ${ISSUE_STATUSES.join(', ')}`,
            });
        }
        const issue = await Issue.findById(req.params.id);
        if (!issue) return res.status(404).send({ status: 'Error', message: 'Issue not found' });
        if (status) issue.status = status;
        if (adminReply !== undefined) issue.adminReply = adminReply;
        issue.handledBy = req.user._id;
        issue.handledAt = new Date();
        await issue.save();

        await notify(issue.reporter, {
            type: NOTIFICATION_TYPES.JOCKEY_HIRED,
            title: `Issue updated: ${issue.title}`,
            body: adminReply || `Status: ${issue.status}`,
            data: { issueId: issue._id, status: issue.status },
        });

        return res.status(200).send({ status: 'Success', message: 'Issue updated', data: issue });
    } catch (err) {
        return res.status(500).send({ status: 'Error', message: err.message });
    }
};
