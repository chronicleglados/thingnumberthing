require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cron = require('node-cron');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const { pool, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new pgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'changeme',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/rooms', require('./routes/rooms'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/post/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'post.html')));
app.get('/new', (req, res) => res.sendFile(path.join(__dirname, 'public', 'new.html')));
app.get('/room/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));
app.get('/new-room', (req, res) => res.sendFile(path.join(__dirname, 'public', 'new-room.html')));

// Cleanup expired posts and rooms every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  const now = Math.floor(Date.now() / 1000);
  const posts = await pool.query('DELETE FROM posts WHERE expires_at IS NOT NULL AND expires_at <= $1', [now]);
  const rooms = await pool.query('DELETE FROM rooms WHERE last_activity <= $1', [now - 30 * 60]);
  if (posts.rowCount > 0) console.log(`Cleaned up ${posts.rowCount} expired post(s)`);
  if (rooms.rowCount > 0) console.log(`Cleaned up ${rooms.rowCount} expired room(s)`);
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`PostBoard running at http://localhost:${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
