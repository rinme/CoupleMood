import { Router } from 'express';
import { getMood, setMood, deleteMood } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyPartner } from '../sse.js';
import { sendPushNotification } from '../push.js';

export const moodRouter = Router();

// All mood routes require authentication
moodRouter.use(requireAuth);

/**
 * GET /api/mood
 * Returns the current user's mood, partner's mood, and partner info.
 */
moodRouter.get('/', (req, res) => {
  const myMood = getMood(req.user.id);
  const partnerMood = req.partner ? getMood(req.partner.id) : null;

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

  try {
    const updatedMood = setMood(
      req.user.id,
      emoji.trim(),
      label.trim(),
      typeof note === 'string' ? note.trim() : null,
      typeof colorTheme === 'string' && colorTheme.trim() ? colorTheme.trim() : 'rose'
    );

    // Notify partner if present
    if (req.partner) {
      notifyPartner(req.partner.id, {
        type: 'mood_update',
        mood: updatedMood,
        user: {
          id: req.user.id,
          nickname: req.user.nickname
        }
      });

      const noteSnippet = updatedMood.note ? ` — "${updatedMood.note}"` : '';
      await sendPushNotification(req.partner.id, {
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

    res.status(200).json({ mood: updatedMood });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update mood' });
  }
});

/**
 * DELETE /api/mood
 * Clears current user's mood, notifies partner via SSE and Web Push.
 */
moodRouter.delete('/', async (req, res) => {
  try {
    deleteMood(req.user.id);

    if (req.partner) {
      notifyPartner(req.partner.id, {
        type: 'mood_cleared',
        mood: null,
        user: {
          id: req.user.id,
          nickname: req.user.nickname
        }
      });

      await sendPushNotification(req.partner.id, {
        title: `${req.user.nickname} cleared their mood`,
        body: `${req.user.nickname} cleared their mood status`,
        data: {
          type: 'mood_cleared'
        }
      }).catch((err) => {
        console.error('Failed to dispatch push notification:', err);
      });
    }

    res.status(200).json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to clear mood' });
  }
});
