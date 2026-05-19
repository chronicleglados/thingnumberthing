# PostBoard — Setup Guide

A clean, minimal public post board with text + image posts, likes/dislikes, comments, and accounts.

---

## What You'll Need

- **Node.js** (v18 or newer) — https://nodejs.org
- **A Cloudinary account** (free) — for image storage — https://cloudinary.com
- **A Railway account** (free) — for hosting — https://railway.app

---

## Step 1 — Install Node.js

1. Go to https://nodejs.org and download the **LTS** version
2. Run the installer
3. Verify it worked: open a terminal and run:
   ```
   node --version
   npm --version
   ```
   Both should print version numbers.

---

## Step 2 — Set Up Cloudinary (image hosting)

1. Go to https://cloudinary.com and create a free account
2. After logging in, go to your **Dashboard**
3. You'll see three values you need — copy them:
   - **Cloud Name**
   - **API Key**
   - **API Secret**

---

## Step 3 — Configure the Project

1. In the project folder, find the file called `.env.example`
2. Make a copy of it named `.env` (no `.example`)
3. Open `.env` and fill in your values:

```
SESSION_SECRET=any-long-random-string-you-make-up
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
PORT=3000
```

> For SESSION_SECRET, just type any random string like: `xK92mQzL8pTw3nVr5jBcDaYh`

---

## Step 4 — Install Dependencies & Run Locally

Open a terminal in the project folder, then run:

```bash
npm install
npm start
```

Then open your browser and go to: **http://localhost:3000**

You should see the PostBoard feed. Try creating an account and making a post!

---

## Step 5 — Deploy to Railway (go live online)

Railway is free and handles everything automatically.

### 5a — Push to GitHub first

1. Go to https://github.com and create a new **private** repository
2. In your project folder, run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

### 5b — Deploy on Railway

1. Go to https://railway.app and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select your repository
4. Railway will detect it's a Node.js app and deploy automatically

### 5c — Add your environment variables on Railway

1. In Railway, click your project → **Variables** tab
2. Add each variable from your `.env` file:
   - `SESSION_SECRET`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
3. Railway sets `PORT` automatically — don't add it

### 5d — Get your live URL

1. Click **Settings → Networking → Generate Domain**
2. Railway gives you a URL like `https://postboard-production.up.railway.app`
3. That's your live site!

---

## Features Summary

| Feature | Detail |
|---|---|
| Post text + images | Anyone can post |
| Logged-in posts | Stay forever, show username, deletable by author |
| Anonymous posts | Expire after 3 days, shown as "Anonymous" |
| Likes & Dislikes | Exact counts shown, toggle on/off, switchable |
| Comments | Anyone can comment |
| Share | Copies post link to clipboard |
| Auth | Simple username + password, no email needed |
| Image storage | Cloudinary (free tier, ~10GB) |
| Database | SQLite — single file, zero maintenance |
| Auto-cleanup | Expired posts deleted hourly automatically |

---

## File Structure

```
postboard/
├── server.js          # Main server
├── db.js              # Database setup
├── package.json
├── .env               # Your secrets (never commit this!)
├── .env.example       # Template
├── routes/
│   ├── auth.js        # Login, register, logout
│   └── posts.js       # Posts, likes, comments
└── public/
    ├── index.html     # Feed page
    ├── new.html       # New post page
    ├── post.html      # Single post page
    ├── css/
    │   └── style.css
    └── js/
        └── utils.js   # Shared JS
```

---

## Notes

- The `.env` file contains secrets — **never upload it to GitHub**. The `.gitignore` below will protect it.
- The SQLite database file (`postboard.db`) is created automatically when the server first starts.
- On Railway, the database resets on each deploy. For persistent data on Railway, you can upgrade to use Railway's PostgreSQL plugin — but for getting started, SQLite works fine.

---

## .gitignore

Create a file named `.gitignore` in the project root with:

```
node_modules/
.env
*.db
```

This prevents your secrets and database from being uploaded to GitHub.
