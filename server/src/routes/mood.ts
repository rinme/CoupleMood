import { Router } from 'express';
import { getMood, setMood, deleteMood } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyPartner, notifyUser } from '../sse.js';
import { sendPushNotification } from '../push.js';

export const moodRouter = Router();

// All mood routes require authentication
moodRouter.use(requireAuth);

/**
 * GET /api/mood
 * Returns the current user's mood, partner's mood, and partner info.
 */
moodRouter.get('/', async (req, res) => {
  const myMood = await getMood(req.user.id);
  const partnerMood = req.partner ? await getMood(req.partner.id) : null;

  res.status(200).json({
    myMood,
    partnerMood,
    partner: req.partner
      ? {
          id: req.partner.id,
          nickname: req.partner.nickname
        }
      : null
  });
});

/**
 * POST /api/mood
 * Upserts mood, triggers SSE event to partner, and dispatches Web Push.
 */
moodRouter.post('/', async (req, res) => {
  const { emoji, label, note, colorTheme } = req.body ?? {};

  if (!emoji || typeof emoji !== 'string' || !emoji.trim()) {
    res.status(400).json({ error: 'Emoji is required' });
    return;
  }

  if (!label || typeof label !== 'string' || !label.trim()) {
    res.status(400).json({ error: 'Label is required' });
    return;
  }

  if (typeof note === 'string' && note.trim().length > 100) {
    res.status(400).json({ error: 'Note must not exceed 100 characters' });
    return;
  }

  try {
    const updatedMood = await setMood(
      req.user.id,
      emoji.trim(),
      label.trim(),
      typeof note === 'string' ? note.trim() : null,
      typeof colorTheme === 'string' && colorTheme.trim() ? colorTheme.trim() : 'rose'
    );

    // Prepare SSE event payload
    const event = {
      type: 'mood_update',
      mood: updatedMood,
      user: {
        id: req.user.id,
        nickname: req.user.nickname
      }
    };

    // Notify partner if present
    if (req.partner) {
      notifyPartner(req.partner.id, event);

      const noteSnippet = updatedMood.note ? ` — "${updatedMood.note}"` : '';
      sendPushNotification(req.partner.id, {
        title: `${req.user.nickname} updated their mood`,
        body: `${updatedMood.emoji} ${updatedMood.label}${noteSnippet}`,
        data: {
          type: 'mood_update',
          mood: updatedMood
        }
      }).catch((err) => {
        console.error('Failed to dispatch push notification:', err);
      });
    }

    // Notify user's active sessions (multi-device sync)
    notifyUser(req.user.id, event);

    res.status(200).json({ mood: updatedMood });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update mood' });
  }
});

/**
 * DELETE /api/mood
 * Clears current user's mood, notifies partner and other devices via SSE.
 */
moodRouter.delete('/', async (req, res) => {
  try {
    await deleteMood(req.user.id);

    const event = {
      type: 'mood_cleared',
      mood: null,
      user: {
        id: req.user.id,
        nickname: req.user.nickname
      }
    };

    if (req.partner) {
      notifyPartner(req.partner.id, event);

      sendPushNotification(req.partner.id, {
        title: `${req.user.nickname} cleared their mood`,
        body: `${req.user.nickname} cleared their mood status`,
        data: {
          type: 'mood_cleared'
        }
      }).catch((err) => {
        console.error('Failed to dispatch push notification:', err);
      });
    }

    // Notify user's active sessions (multi-device sync)
    notifyUser(req.user.id, event);

    res.status(200).json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to clear mood' });
  }
});
