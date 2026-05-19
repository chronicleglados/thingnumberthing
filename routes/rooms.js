const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const Ably = require('ably');

const VALID_TAGS = ['Proxy','Mirror','Bypass','Exploit','CVE','XSS','SQLi','Tool','OSINT','Payload','Misc'];
const ROOM_EXPIRY = 30 * 60; // 30 minutes in seconds
const MSG_COOLDOWN = 2500; // 2.5 seconds

const msgCooldowns = new Map();

function getAbly() {
  return new Ably.Rest(process.env.ABLY_API_KEY);
}

// GET all active rooms
router.get('/', async (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - ROOM_EXPIRY;
  const { tag } = req.query;
  const params = [cutoff];
  let tagFilter = '';
  if (tag && VALID_TAGS.includes(tag)) {
    tagFilter = 'AND r.tag = $2';
    params.push(tag);
  }
  const result = await pool.query(`
    SELECT r.id, r.title, r.tag, r.created_at, r.last_activity,
           u.username,
           (SELECT COUNT(*) FROM room_messages WHERE room_id = r.id)::int as message_count,
           ($1 + ${ROOM_EXPIRY} - r.last_activity)::int as expires_in
    FROM rooms r
    JOIN users u ON r.user_id = u.id
    WHERE r.last_activity > $1 ${tagFilter}
    ORDER BY r.last_activity DESC
  `, params);
  res.json(result.rows);
});

// GET single room
router.get('/:id', async (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - ROOM_EXPIRY;
  const result = await pool.query(`
    SELECT r.id, r.title, r.tag, r.created_at, r.last_activity, r.user_id,
           u.username,
           ($1 + ${ROOM_EXPIRY} - r.last_activity)::int as expires_in
    FROM rooms r
    JOIN users u ON r.user_id = u.id
    WHERE r.id = $2 AND r.last_activity > $3
  `, [now, req.params.id, cutoff]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Room not found or expired' });
  res.json(result.rows[0]);
});

// GET room messages
router.get('/:id/messages', async (req, res) => {
  const result = await pool.query(`
    SELECT id, username, text, created_at
    FROM room_messages
    WHERE room_id = $1
    ORDER BY created_at ASC
    LIMIT 200
  `, [req.params.id]);
  res.json(result.rows);
});

// POST create room — logged in only
router.post('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'You must be logged in to create a room.' });
  const { title, tag } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (tag && !VALID_TAGS.includes(tag)) return res.status(400).json({ error: 'Invalid tag' });

  const result = await pool.query(
    'INSERT INTO rooms (title, tag, user_id) VALUES ($1, $2, $3) RETURNING id',
    [title.trim(), tag || null, req.session.userId]
  );

  const room = await pool.query(`
    SELECT r.id, r.title, r.tag, r.created_at, r.last_activity,
           u.username, 0 as message_count,
           ${ROOM_EXPIRY}::int as expires_in
    FROM rooms r JOIN users u ON r.user_id = u.id WHERE r.id = $1
  `, [result.rows[0].id]);

  res.status(201).json(room.rows[0]);
});

// DELETE room — creator only
router.delete('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const result = await pool.query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
  const room = result.rows[0];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.user_id !== req.session.userId) return res.status(403).json({ error: 'Not your room' });
  await pool.query('DELETE FROM rooms WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// POST send message — 2.5s cooldown, anon allowed
router.post('/:id/messages', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - ROOM_EXPIRY;

  // Check room exists and is active
  const roomResult = await pool.query('SELECT * FROM rooms WHERE id = $1 AND last_activity > $2', [req.params.id, cutoff]);
  if (!roomResult.rows[0]) return res.status(404).json({ error: 'Room not found or expired' });

  // Cooldown
  const cooldownKey = req.session.userId || req.session.anonToken || req.ip;
  const last = msgCooldowns.get(cooldownKey);
  if (last && Date.now() - last < MSG_COOLDOWN) {
    return res.status(429).json({ error: 'Please wait before sending another message.' });
  }
  msgCooldowns.set(cooldownKey, Date.now());

  const username = req.session.username || 'Anonymous';
  const user_id = req.session.userId || null;

  // Save message
  await pool.query(
    'INSERT INTO room_messages (room_id, user_id, username, text) VALUES ($1, $2, $3, $4)',
    [req.params.id, user_id, username, text.trim()]
  );

  // Update room last_activity
  await pool.query('UPDATE rooms SET last_activity = $1 WHERE id = $2', [now, req.params.id]);

  // Publish to Ably
  try {
    const ably = getAbly();
    const channel = ably.channels.get(`room-${req.params.id}`);
    await channel.publish('message', {
      username,
      text: text.trim(),
      created_at: now
    });
  } catch(e) {
    console.error('Ably publish error:', e.message);
  }

  res.status(201).json({ success: true });
});

// GET Ably token for client
router.get('/:id/token', async (req, res) => {
  try {
    const ably = new Ably.Rest(process.env.ABLY_API_KEY);
    const tokenRequest = await ably.auth.createTokenRequest({
      clientId: req.session.userId ? String(req.session.userId) : 'anon',
      capability: { [`room-${req.params.id}`]: ['subscribe'] }
    });
    res.json(tokenRequest);
  } catch(e) {
    res.status(500).json({ error: 'Could not create token' });
  }
});

module.exports = router;
