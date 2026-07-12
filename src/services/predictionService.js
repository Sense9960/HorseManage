import Prediction from '../models/Prediction.js';
import { EndUser } from '../models/User.js';
import { notify } from './notificationService.js';
import { NOTIFICATION_TYPES } from '../models/Notification.js';

const WIN_THRESHOLD = { Top1: 1, Top2: 2, Top3: 3 };

// Settle all Pending predictions for a finished race. Idempotent — only
// Pending rows are touched, so calling twice is safe.
export const settleRacePredictions = async (race) => {
    const failures = [];
    const predictions = await Prediction.find({ race: race._id, status: 'Pending' });

    for (const p of predictions) {
        try {
            const reg = race.registrations.id(p.registration);
            const rank = reg?.finalRank;
            const threshold = WIN_THRESHOLD[p.predictionType];
            const won = Number.isInteger(rank) && rank >= 1 && rank <= threshold;

            p.status = won ? 'Won' : 'Lost';
            p.payout = won ? p.potentialPayout : 0;
            p.settledAt = new Date();
            await p.save();

            if (won) {
                // EndUser model — base User strip $inc trên field points (discriminator).
                await EndUser.updateOne({ _id: p.user }, { $inc: { points: p.payout } });
            }
            await notify(p.user, {
                type: NOTIFICATION_TYPES.PREDICTION_BONUS,
                title: won
                    ? `Won ${p.predictionType} prediction on race "${race.name}"`
                    : `Lost ${p.predictionType} prediction on race "${race.name}"`,
                body: won
                    ? `You received ${p.payout} points (stake ${p.stake} × ${p.oddsAtPlacement}).`
                    : `You lost ${p.stake} staked points.`,
                data: { predictionId: p._id, raceId: race._id, payout: p.payout, stake: p.stake },
            });
        } catch (e) {
            failures.push({ kind: 'prediction', predictionId: p._id, error: e.message });
        }
    }
    return failures;
};
