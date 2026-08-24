import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { create, getBySlug, join, list } from '../controllers/room.controller';
import { asyncHandler } from '../middleware/async.handler';
import { requireAuth } from '../middleware/auth.middleware';

/** Token minting is resource-sensitive (grants SFU access) — rate limit it. */
const joinLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many join attempts, please try again later' },
});

const router = Router();

// Every room route requires a valid app JWT.
router.use(requireAuth);

router.post('/', asyncHandler(create));
router.get('/', asyncHandler(list));
router.get('/:slug', asyncHandler(getBySlug));
router.post('/:slug/join', joinLimiter, asyncHandler(join));

export default router;
