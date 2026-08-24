import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { guest, login, register } from '../controllers/auth.controller';
import { asyncHandler } from '../middleware/async.handler';

/** Brute-force guard for auth endpoints. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

const router = Router();

router.get('/guest', authLimiter, asyncHandler(guest));
router.post('/guest', authLimiter, asyncHandler(guest));
router.post('/register', authLimiter, asyncHandler(register));
router.post('/login', authLimiter, asyncHandler(login));

export default router;
