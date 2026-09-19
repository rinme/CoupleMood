import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getUserPresets, setUserPresets, resetUserPresets } from '../db.js';

export const presetsRouter = Router();

/**
 * GET /api/presets
 * Returns customized presets for the authenticated user, or defaults if none configured.
 * Query param: ?lang=th|en (defaults to 'th')
 */
presetsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const lang = (req.query.lang === 'en' ? 'en' : 'th') as 'th' | 'en';
  const presets = await getUserPresets(req.user.id, lang);
  res.status(200).json({ presets });
});

/**
 * PUT /api/presets
 * Saves customized presets for the authenticated user atomically.
 * Body: { presets: Array<{ emoji: string, label: string, colorTheme?: string, color_theme?: string }> }
 * Validates: 1-16 items, emoji non-empty, label non-empty and <= 30 chars.
 */
presetsRouter.put('/', requireAuth, async (req: Request, res: Response) => {
  const presets = req.body?.presets;

  if (!Array.isArray(presets) || presets.length < 1 || presets.length > 16) {
    res.status(400).json({ error: 'Presets must be an array of 1 to 16 items' });
    return;
  }

  for (const item of presets) {
    if (!item || typeof item !== 'object') {
      res.status(400).json({ error: 'Each preset must be an object' });
      return;
    }

    if (
      typeof item.emoji !== 'string' ||
      item.emoji.trim() === '' ||
      item.emoji.trim().length > 10
    ) {
      res.status(400).json({ error: 'Preset emoji is required and must not exceed 10 characters' });
      return;
    }

    if (
      typeof item.label !== 'string' ||
      item.label.trim() === '' ||
      item.label.trim().length > 30
    ) {
      res.status(400).json({ error: 'Preset label is required and must not exceed 30 characters' });
      return;
    }
  }

  const updated = await setUserPresets(req.user.id, presets);
  res.status(200).json({ presets: updated });
});

/**
 * DELETE /api/presets/reset
 * Resets user's custom presets and returns default presets.
 * Query param: ?lang=th|en (defaults to 'th')
 */
presetsRouter.delete('/reset', requireAuth, async (req: Request, res: Response) => {
  const lang = (req.query.lang === 'en' ? 'en' : 'th') as 'th' | 'en';
  await resetUserPresets(req.user.id, lang);
  const presets = await getUserPresets(req.user.id, lang);
  res.status(200).json({
    message: 'Presets reset to default',
    presets
  });
});
