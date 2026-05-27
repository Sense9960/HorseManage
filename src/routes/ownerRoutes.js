import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../models/User.js';
import {
    createHorse,
    listMyHorses,
    getMyHorse,
    updateHorse,
    deleteHorse,
    assignJockey,
    registerForRace,
    listHireableJockeys,
    listMyRaceOffers,
    cancelRaceOffer,
    listRacesForOwner,
} from '../controllers/ownerController.js';

const router = express.Router();

router.use(authenticate, authorize(ROLES.OWNER_HORSE));

router.post('/horses', createHorse);
router.get('/horses', listMyHorses);
router.get('/horses/:id', getMyHorse);
router.put('/horses/:id', updateHorse);
router.delete('/horses/:id', deleteHorse);
router.patch('/horses/:id/jockey', assignJockey);
router.post('/races/:raceId/register', registerForRace);
router.delete('/races/:raceId/registrations/:regId', cancelRaceOffer);

router.get('/races', listRacesForOwner);
router.get('/jockeys', listHireableJockeys);
router.get('/race-offers', listMyRaceOffers);

export default router;
