import mongoose from 'mongoose';

export const ISSUE_STATUSES = ['Open', 'InProgress', 'Resolved', 'Closed'];

// User-submitted problem report sent to admins. Any role can create.
const issueSchema = new mongoose.Schema(
    {
        reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        title: { type: String, required: true, trim: true, maxlength: 200 },
        content: { type: String, required: true, trim: true },
        imageUrl: { type: String, trim: true },
        status: { type: String, enum: ISSUE_STATUSES, default: 'Open', index: true },
        adminReply: { type: String, trim: true },
        handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        handledAt: { type: Date },
    },
    { timestamps: true }
);

issueSchema.index({ reporter: 1, createdAt: -1 });

export default mongoose.model('Issue', issueSchema);
