const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const crypto = require('crypto');

const VALID_TAGS = ['Proxy','Mirror','Bypass','Exploit','CVE','XSS','SQLi','Tool','OSINT','Payload','Misc'];
const POST_COOLDOWN = 5 * 60; // 5 minutes in seconds
const COMMENT_COOLDOWN = 2500; // 2.5 seconds in ms

// In-memory comment cooldown tracker
const commentCooldowns = new Map();

// GET all posts
router.get('/', async (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const { tag } = req.query;
  const params = [now];
  let tagFilter = '';
  if (tag && VALID_TAGS.includes(tag)) {
    tagFilter = 'AND p.tag = $2';
    params.push(tag);
  }
  const result = await pool.query(`
    SELECT p.id, p.title, p.tag, p.image_url, p.created_at, p.expires_at,
           u.username,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND type = 'like')::int as likes,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND type = 'dislike')::int as dislikes,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id)::int as comment_count
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE (p.expires_at IS NULL OR p.expires_at > $1) ${tagFilter}
    ORDER BY p.created_at DESC
  `, params);
  res.json(result.rows);
});

// GET single post
router.get('/:id', async (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const result = await pool.query(`
    SELECT p.id, p.title, p.text, p.tag, p.image_url, p.created_at, p.expires_at,
           u.username,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND type = 'like')::int as likes,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND type = 'dislike')::int as dislikes
    FROM posts p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.id = $1 AND (p.expires_at IS NULL OR p.expires_at > $2)
  `, [req.params.id, now]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Post not found' });
  res.json(result.rows[0]);
});

// POST create post
router.post('/', upload.single('image'), async (req, res) => {
  const { title, text, tag } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (tag && !VALID_TAGS.includes(tag)) return res.status(400).json({ error: 'Invalid tag' });

  const user_id = req.session.userId || null;
  const now = Math.floor(Date.now() / 1000);

  // Post cooldown for logged-in users
  if (user_id) {
    const cd = await pool.query('SELECT last_post FROM post_cooldowns WHERE user_id = $1', [user_id]);
    if (cd.rows[0]) {
      const diff = now - cd.rows[0].last_post;
      if (diff < POST_COOLDOWN) {
        const remaining = POST_COOLDOWN - diff;
        return res.status(429).json({ error: `Please wait ${Math.ceil(remaining / 60)} minute(s) before posting again.` });
      }
    }
  }

  let image_url = null;
  if (req.file) {
    try {
      const b64 = req.file.buffer.toString('base64');
      const dataUri = `data:${req.file.mimetype};base64,${b64}`;
      const result = await cloudinary.uploader.upload(dataUri, { folder: 'postboard' });
      image_url = result.secure_url;
    } catch (e) {
      return res.status(500).json({ error: 'Image upload failed. Check Cloudinary config.' });
    }
  }

  const expires_at = user_id ? null : now + 60 * 60; // anon: 1 hour

  const result = await pool.query(
    'INSERT INTO posts (title, text, image_url, tag, user_id, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [title.trim(), text || null, image_url, tag || null, user_id, expires_at]
  );

  // Update cooldown
  if (user_id) {
    await pool.query(`
      INSERT INTO post_cooldowns (user_id, last_post) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET last_post = $2
    `, [user_id, now]);
  }

  const post = await pool.query(`
    SELECT p.id, p.title, p.tag, p.image_url, p.created_at, p.expires_at,
           u.username, 0 as likes, 0 as dislikes, 0 as comment_count
    FROM posts p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = $1
  `, [result.rows[0].id]);

  res.status(201).json(post.rows[0]);
});

// DELETE post
router.delete('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const result = await pool.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
  const post = result.rows[0];
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.session.userId) return res.status(403).json({ error: 'Not your post' });
  await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// POST react
router.post('/:id/react', async (req, res) => {
  const { type } = req.body;
  if (!['like', 'dislike'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

  const postId = req.params.id;
  const userId = req.session.userId || null;

  let anonToken = null;
  if (!userId) {
    if (!req.session.anonToken) req.session.anonToken = crypto.randomUUID();
    anonToken = req.session.anonToken;
  }

  const existing = userId
    ? await pool.query('SELECT * FROM likes WHERE post_id = $1 AND user_id = $2', [postId, userId])
    : await pool.query('SELECT * FROM likes WHERE post_id = $1 AND anon_token = $2', [postId, anonToken]);

  const row = existing.rows[0];
  if (row) {
    if (row.type === type) {
      await pool.query('DELETE FROM likes WHERE id = $1', [row.id]);
    } else {
      await pool.query('UPDATE likes SET type = $1 WHERE id = $2', [type, row.id]);
    }
  } else {
    await pool.query(
      'INSERT INTO likes (post_id, user_id, anon_token, type) VALUES ($1, $2, $3, $4)',
      [postId, userId, anonToken, type]
    );
  }

  const counts = await pool.query(`
    SELECT
      SUM(CASE WHEN type='like' THEN 1 ELSE 0 END)::int as likes,
      SUM(CASE WHEN type='dislike' THEN 1 ELSE 0 END)::int as dislikes
    FROM likes WHERE post_id = $1
  `, [postId]);

  res.json({ likes: counts.rows[0].likes || 0, dislikes: counts.rows[0].dislikes || 0 });
});

// GET comments
router.get('/:id/comments', async (req, res) => {
  const result = await pool.query(`
    SELECT c.id, c.text, c.created_at, u.username
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.post_id = $1
    ORDER BY c.created_at ASC
  `, [req.params.id]);
  res.json(result.rows);
});

// POST comment — logged in only, 2.5s cooldown
router.post('/:id/comments', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'You must be logged in to comment.' });

  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });

  // 2.5s cooldown
  const last = commentCooldowns.get(req.session.userId);
  if (last && Date.now() - last < COMMENT_COOLDOWN) {
    return res.status(429).json({ error: 'Please wait before commenting again.' });
  }
  commentCooldowns.set(req.session.userId, Date.now());

  const user_id = req.session.userId;
  const result = await pool.query(
    'INSERT INTO comments (post_id, user_id, text) VALUES ($1, $2, $3) RETURNING id',
    [req.params.id, user_id, text.trim()]
  );

  const comment = await pool.query(`
    SELECT c.id, c.text, c.created_at, u.username
    FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = $1
  `, [result.rows[0].id]);

  res.status(201).json(comment.rows[0]);
});

module.exports = router;
