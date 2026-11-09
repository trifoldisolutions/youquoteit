const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Tag = require('../models/Tag');
const Quote = require('../models/Quote');
const router = express.Router();

const SESSION_COOKIE = 'uid';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function setSessionCookie(res, userId) {
  res.cookie(SESSION_COOKIE, String(userId), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

// Device-uploaded quote backgrounds land here (created up front in
// server.js) so they survive a reload — unlike the object URL the create-
// quote modal previews them with client-side, which only lives as long as
// the tab does.
const BG_UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'quote-backgrounds');
const MAX_BG_BYTES = 8 * 1024 * 1024;
const uploadBg = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, BG_UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: MAX_BG_BYTES },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

// Wraps uploadBg.single so a rejected/oversized/wrong-type file comes back
// as a normal JSON error instead of an uncaught exception (multer reports
// failures via its own callback, not a thrown error async/await can catch).
function handleBgUpload(req, res, next) {
  uploadBg.single('bgFile')(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'Could not process the uploaded image.' });
    next();
  });
}

// Mirrors the client-side rules in public/js/app.js (initAuthModal) — kept
// in sync by hand since there's no shared module boundary between the
// server and the plain <script> the browser loads.
const USERNAME_RE = /^(?!\d+$)[A-Za-z0-9_]{2,}$/;
const AUTHOR_NAME_RE = /^\S+(?:\s+\S+){0,3}$/;
const PASSWORD_RE = /^(?=(?:.*[a-z]){2,})(?=(?:.*[A-Z]){2,})(?=(?:.*[0-9]){2,})(?=(?:.*[^A-Za-z0-9]){2,}).{8,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors HASHTAG_RE/MAX_HASHTAGS in public/js/app.js (initCreateQuoteModal).
const HASHTAG_RE = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/;
const MAX_HASHTAGS = 5;
const HASHTAG_SUGGESTION_LIMIT = 6;

// Mirrors DISCOVER_LIMIT in public/js/app.js (initCategoriesPopup).
const TAG_DISCOVER_LIMIT = 12;
const TAG_DISCOVER_MAX_LIMIT = 50;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function usernameLookup(username) {
  return { $regex: '^' + escapeRegex(username) + '$', $options: 'i' };
}

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const UNSPLASH_API_BASE = 'https://api.unsplash.com';
const UNSPLASH_UTM = 'utm_source=youquoteit&utm_medium=referral';

// Mirrors config/themes.json, also reflected in the [data-theme] blocks in src/input.css.
const THEMES = [
  { id: 'default', name: 'Default' },
  { id: 'dark_default', name: 'Dark Default' },
  { id: 'buttercup', name: 'Buttercup' },
  { id: 'royal', name: 'Royal' },
  { id: 'dazzle', name: 'Dazzle' },
  { id: 'blackn', name: 'Blackn' },
  { id: 'aqua', name: 'Aqua' },
  { id: 'watermelon', name: 'Watermelon' },
];

// Fallback data for a fresh install before anyone's published a real quote
// — GET '/' below prefers real Quote documents and only falls back to this
// when the collection is empty.
const SAMPLE_QUOTES = [
  {
    id: 'q1',
    text: 'Only those who will risk going too far can possibly find out how far one can go.',
    author: 'T. S. Eliot',
    authorQuoteCount: 214,
    authorAppreciations: 58200,
    category: 'wisdom',
    bgImage: null,
    views: 128400,
    likes: 9821,
    comments: 642,
    screenshots: 3480,
  },
  {
    id: 'q2',
    text: 'The unexamined life is not worth living.',
    author: 'Socrates',
    authorQuoteCount: 96,
    authorAppreciations: 41500,
    category: 'life',
    bgImage: null,
    views: 84210,
    likes: 5310,
    comments: 318,
    screenshots: 1920,
  },
  {
    id: 'q3',
    text: 'The only way to do great work is to love what you do.',
    author: 'Steve Jobs',
    authorQuoteCount: 132,
    authorAppreciations: 187300,
    category: 'technology',
    bgImage: null,
    views: 302150,
    likes: 41800,
    comments: 2140,
    screenshots: 15600,
  },
  {
    id: 'q4',
    text: 'In the middle of every difficulty lies opportunity.',
    author: 'Albert Einstein',
    authorQuoteCount: 178,
    authorAppreciations: 94600,
    category: 'change',
    bgImage: null,
    views: 152300,
    likes: 12990,
    comments: 875,
    screenshots: 4720,
  },
  {
    id: 'q5',
    text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
    author: 'Aristotle',
    authorQuoteCount: 143,
    authorAppreciations: 63400,
    category: 'wisdom',
    bgImage: null,
    views: 96100,
    likes: 7420,
    comments: 401,
    screenshots: 2260,
  },
  {
    id: 'q6',
    text: 'Where there is love there is life.',
    author: 'Mahatma Gandhi',
    authorQuoteCount: 87,
    authorAppreciations: 52900,
    category: 'love',
    bgImage: null,
    views: 61230,
    likes: 5990,
    comments: 289,
    screenshots: 1740,
  },
];

// Maps a Quote document (with authorUser populated) to the flat shape the
// client already expects (public/js/app.js reads these fields directly,
// same as it did for SAMPLE_QUOTES).
function shapeQuoteForClient(doc) {
  return {
    id: String(doc._id),
    text: doc.text,
    author: doc.authorName,
    authorQuoteCount: (doc.authorUser && doc.authorUser.quoteCount) || 1,
    // No appreciation events are tracked yet (likes aren't persisted), so
    // this stays honestly at 0 rather than faking a number.
    authorAppreciations: 0,
    category: null,
    bgImage: doc.bgImage,
    bgCredit: doc.bgCredit || null,
    bgPosition: doc.bgPosition,
    hashtags: doc.hashtags || [],
    likes: doc.likes,
    dislikes: doc.dislikes,
    comments: doc.comments,
    views: doc.views,
    screenshots: doc.screenshots,
    showAppreciations: doc.showAppreciations,
    showDisapprovals: doc.showDisapprovals,
    allowComments: doc.allowComments,
    allowSnapshots: doc.allowSnapshots,
    matureAudience: doc.matureAudience,
  };
}

router.get('/', async (req, res) => {
  try {
    // $sample instead of sort-by-createdAt+limit: the seed script inserts
    // thousands of quotes in one batch with near-identical timestamps, so a
    // recency sort just falls back to storage order on those ties — which
    // clusters by author, since the source dataset lists each author's
    // quotes together. A random sample avoids that regardless of insert order.
    const docs = await Quote.aggregate([
      { $sample: { size: 50 } },
      { $lookup: { from: 'users', localField: 'authorUser', foreignField: '_id', as: 'authorUserDoc' } },
      { $unwind: { path: '$authorUserDoc', preserveNullAndEmptyArrays: true } },
    ]);
    const quotes = docs.length
      ? docs.map((doc) => shapeQuoteForClient({ ...doc, authorUser: doc.authorUserDoc }))
      : SAMPLE_QUOTES;
    res.render('app/index', {
      title: 'YouQuoteIt',
      quotes,
      themes: THEMES,
      currentUser: req.user ? { username: req.user.username, authorName: req.user.authorName, email: req.user.email } : null,
    });
  } catch (err) {
    res.render('app/index', { title: 'YouQuoteIt', quotes: SAMPLE_QUOTES, themes: THEMES, currentUser: null });
  }
});

router.get('/login', (req, res) => {
  res.render('app/auth/login', { title: 'Log In / Sign Up — YouQuoteIt' });
});

router.get('/quotes', (req, res) => {
  res.render('app/quotes', { title: 'Quotes — YouQuoteIt' });
});

// Real quotes matching the reader's pinned categories (Tag names — see
// quoteDeck.refreshRecommendations in public/js/app.js, fed by the pins the
// header's Categories popup confirms). Pins live in localStorage only, so
// this is a stateless lookup keyed on whatever tags the client currently
// has pinned, not a per-account preference — there's no ranking beyond a
// random sample among the matches, same honesty as /tags/suggestions.
// `exclude` skips ids already in the client's deck so pinning doesn't just
// hand back quotes already on screen.
router.get('/quotes/recommended', async (req, res) => {
  const tags = String(req.query.tags || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!tags.length) return res.json({ quotes: [] });

  const exclude = String(req.query.exclude || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

  try {
    const docs = await Quote.aggregate([
      { $match: { hashtags: { $in: tags }, _id: { $nin: exclude } } },
      { $sample: { size: limit } },
      { $lookup: { from: 'users', localField: 'authorUser', foreignField: '_id', as: 'authorUserDoc' } },
      { $unwind: { path: '$authorUserDoc', preserveNullAndEmptyArrays: true } },
    ]);
    res.json({ quotes: docs.map((doc) => shapeQuoteForClient({ ...doc, authorUser: doc.authorUserDoc })) });
  } catch (err) {
    res.status(500).json({ quotes: [] });
  }
});

// Live availability check while typing a username in the sign-up modal.
router.get('/username-available', async (req, res) => {
  const username = String(req.query.username || '');
  if (!USERNAME_RE.test(username)) {
    return res.json({ available: false, reason: 'invalid' });
  }

  try {
    const existing = await User.findOne({ username: usernameLookup(username) }).lean();
    res.json({ available: !existing });
  } catch (err) {
    res.status(500).json({ available: false, reason: 'error' });
  }
});

// Autocomplete while typing a hashtag in the create-quote modal. A read
// against the small, indexed Tag collection — no write happens here, so
// this is cheap to call on every debounced keystroke (see
// HASHTAG_SEARCH_DEBOUNCE_MS in public/js/app.js).
router.get('/hashtags/search', async (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase().slice(0, 24);
  if (!query) return res.json({ tags: [] });

  try {
    const tags = await Tag.find({ name: { $regex: escapeRegex(query) } })
      .sort({ quoteCount: -1, name: 1 })
      .limit(HASHTAG_SUGGESTION_LIMIT)
      .select('name quoteCount')
      .lean();
    res.json({ tags: tags.map((t) => ({ name: t.name, quoteCount: t.quoteCount })) });
  } catch (err) {
    res.status(500).json({ tags: [] });
  }
});

// Called once at publish time (fire-and-forget, like /unsplash/track-download
// below) to record the hashtags a quote went out with. This is the only
// write hashtags ever cause — at most MAX_HASHTAGS upserts per publish, not
// per keystroke — and it's what backs the quoteCount /hashtags/search reads.
router.post('/hashtags/register', async (req, res) => {
  const raw = Array.isArray(req.body && req.body.hashtags) ? req.body.hashtags : [];
  const tags = [...new Set(
    raw
      .filter((t) => typeof t === 'string')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => HASHTAG_RE.test(t))
  )].slice(0, MAX_HASHTAGS);

  if (!tags.length) return res.status(400).json({ error: 'No valid hashtags.' });

  try {
    await Tag.bulkWrite(tags.map((name) => ({
      updateOne: {
        filter: { name },
        update: { $inc: { quoteCount: 1 }, $setOnInsert: { name } },
        upsert: true,
      },
    })));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register hashtags.' });
  }
});

// Random sample of existing categories for the header menu's "Discover"
// list (initCategoriesPopup in public/js/app.js) — already-pinned tags are
// passed in `exclude` so they don't show up twice. Purely random for now
// via $sample; a later pass will rank this by popularity (appreciations on
// tagged quotes) instead, without changing the response shape.
router.get('/tags/suggestions', async (req, res) => {
  const exclude = String(req.query.exclude || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const limit = Math.min(parseInt(req.query.limit, 10) || TAG_DISCOVER_LIMIT, TAG_DISCOVER_MAX_LIMIT);

  try {
    const tags = await Tag.aggregate([
      { $match: { quoteCount: { $gt: 0 }, name: { $nin: exclude } } },
      { $sample: { size: limit } },
      { $project: { _id: 0, name: 1, quoteCount: 1 } },
    ]);
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ tags: [] });
  }
});

router.post('/signup', async (req, res) => {
  const { username, authorName, email, password } = req.body || {};

  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Invalid username.', field: 'username' });
  }
  if (typeof authorName !== 'string' || authorName.length > 20 || !AUTHOR_NAME_RE.test(authorName)) {
    return res.status(400).json({ error: "Invalid author's name.", field: 'authorName' });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email.', field: 'email' });
  }
  if (typeof password !== 'string' || !PASSWORD_RE.test(password)) {
    return res.status(400).json({ error: 'Password does not meet requirements.', field: 'password' });
  }

  try {
    const existing = await User.findOne({
      $or: [{ username: usernameLookup(username) }, { email: email.toLowerCase() }],
    }).lean();
    if (existing) {
      const takenField = existing.username.toLowerCase() === username.toLowerCase() ? 'username' : 'email';
      return res.status(409).json({
        error: takenField === 'username' ? 'Username is taken.' : 'Email is already registered.',
        field: takenField,
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, authorName, email, passwordHash });
    setSessionCookie(res, user._id);
    res.status(201).json({ ok: true });
  } catch (err) {
    // Backstop for the race between the check above and this insert.
    if (err && err.code === 11000) {
      const takenField = err.keyPattern && err.keyPattern.username ? 'username' : 'email';
      return res.status(409).json({
        error: takenField === 'username' ? 'Username is taken.' : 'Email is already registered.',
        field: takenField,
      });
    }
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || !EMAIL_RE.test(email) || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Enter a valid email and password.' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    // Same generic error either way — confirming which part was wrong would
    // let a caller enumerate registered emails.
    const match = user && (await bcrypt.compare(password, user.passwordHash));
    if (!match) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    setSessionCookie(res, user._id);
    res.json({ username: user.username, authorName: user.authorName, email: user.email });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

// The Access Key stays server-side per Unsplash's API guidelines, so the
// browser talks to this proxy instead of api.unsplash.com directly.
router.get('/unsplash/search', async (req, res) => {
  const query = String(req.query.query || '').trim().slice(0, 100);
  const page = Math.min(50, Math.max(1, parseInt(req.query.page, 10) || 1));
  if (!query) return res.status(400).json({ error: 'Enter a search term.' });
  if (!UNSPLASH_ACCESS_KEY) return res.status(503).json({ error: 'Unsplash search is not configured.' });

  try {
    const url = new URL(UNSPLASH_API_BASE + '/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '20');

    const unsplashRes = await fetch(url, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
    });
    if (!unsplashRes.ok) {
      return res.status(unsplashRes.status === 401 || unsplashRes.status === 403 ? 503 : 502)
        .json({ error: 'Unsplash search failed.' });
    }

    const data = await unsplashRes.json();
    const results = (data.results || []).map((photo) => ({
      id: photo.id,
      thumb: photo.urls.small,
      full: photo.urls.regular,
      description: photo.alt_description || photo.description || 'Unsplash photo',
      downloadLocation: photo.links.download_location,
      author: {
        name: photo.user.name,
        link: `${photo.user.links.html}?${UNSPLASH_UTM}`,
      },
    }));
    res.json({ results, totalPages: data.total_pages || 1 });
  } catch (err) {
    res.status(502).json({ error: 'Unsplash search failed.' });
  }
});

// Unsplash requires pinging the photo's download_location whenever a photo
// is put to use (here: chosen as a quote background), separately from the
// search call above. See https://help.unsplash.com/api-guidelines/unsplash-api-guidelines/guideline-triggering-a-download
router.post('/unsplash/track-download', async (req, res) => {
  const { downloadLocation } = req.body || {};
  if (typeof downloadLocation !== 'string' || !downloadLocation.startsWith(UNSPLASH_API_BASE + '/')) {
    return res.status(400).json({ error: 'Invalid download location.' });
  }
  if (!UNSPLASH_ACCESS_KEY) return res.status(503).json({ error: 'Unsplash is not configured.' });

  try {
    await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: 'Failed to register the download.' });
  }
});

// The logged-in user's own published quotes, most recent first — backs the
// Quotes tab in the profile popup (public/js/app.js initProfilePopup).
router.get('/me/quotes', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'You must be logged in.' });

  try {
    const docs = await Quote.find({ authorUser: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    // req.user already carries this account's own quoteCount, so it stands
    // in for the populate() a cross-author query would otherwise need.
    res.json({ quotes: docs.map((doc) => shapeQuoteForClient({ ...doc, authorUser: req.user })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load your quotes.' });
  }
});

// Publishes a quote for real — the create-quote modal in public/js/app.js
// posts here as multipart/form-data so a device-uploaded background (if
// any) rides along as req.file; an Unsplash-sourced background arrives as
// plain fields instead (bgImage/bgCreditName/bgCreditLink).
router.post('/quotes', handleBgUpload, async (req, res) => {
  if (!req.user) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(401).json({ error: 'You must be logged in to publish a quote.' });
  }

  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > 110) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Quote text must be between 1 and 110 characters.' });
  }

  let hashtags = [];
  try {
    const raw = JSON.parse(req.body.hashtags || '[]');
    if (Array.isArray(raw)) {
      hashtags = [...new Set(
        raw.filter((t) => typeof t === 'string').map((t) => t.trim().toLowerCase()).filter((t) => HASHTAG_RE.test(t))
      )].slice(0, MAX_HASHTAGS);
    }
  } catch (err) {
    hashtags = [];
  }

  function parseBool(value, fallback) {
    return value === undefined ? fallback : value === 'true';
  }

  let bgImage = null;
  let bgCredit = null;
  if (req.file) {
    bgImage = '/uploads/quote-backgrounds/' + req.file.filename;
  } else if (req.body.bgSource === 'unsplash' && typeof req.body.bgImage === 'string' && req.body.bgImage) {
    bgImage = req.body.bgImage;
    if (typeof req.body.bgCreditName === 'string' && typeof req.body.bgCreditLink === 'string') {
      bgCredit = { name: req.body.bgCreditName, link: req.body.bgCreditLink };
    }
  }

  const bgPosition = typeof req.body.bgPosition === 'string' && /^\d{1,3}% \d{1,3}%$/.test(req.body.bgPosition)
    ? req.body.bgPosition
    : '50% 50%';

  try {
    const doc = await Quote.create({
      text,
      authorUser: req.user._id,
      authorName: req.user.authorName,
      bgImage,
      bgCredit,
      bgPosition,
      hashtags,
      showAppreciations: parseBool(req.body.showAppreciations, true),
      showDisapprovals: parseBool(req.body.showDisapprovals, true),
      allowComments: parseBool(req.body.allowComments, true),
      allowSnapshots: parseBool(req.body.allowSnapshots, true),
      matureAudience: parseBool(req.body.matureAudience, false),
    });
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { quoteCount: 1 } },
      { new: true }
    ).select('quoteCount').lean();

    res.status(201).json({
      ok: true,
      quote: shapeQuoteForClient({ ...doc.toObject(), authorUser: updatedUser }),
    });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Failed to publish quote.' });
  }
});

router.routes = [
  { method: 'GET', path: '/app', label: 'App index' },
  { method: 'GET', path: '/app/login', label: 'Log in / sign up' },
  { method: 'GET', path: '/app/quotes', label: 'Quotes (placeholder)' },
  { method: 'GET', path: '/app/quotes/recommended', label: 'Random quotes matching pinned categories (JSON)' },
  { method: 'GET', path: '/app/username-available', label: 'Check username availability (JSON)' },
  { method: 'GET', path: '/app/hashtags/search', label: 'Search hashtags by prefix/substring (JSON)' },
  { method: 'POST', path: '/app/hashtags/register', label: 'Record hashtags used on a published quote (JSON)' },
  { method: 'GET', path: '/app/tags/suggestions', label: 'Random sample of categories for the header menu (JSON)' },
  { method: 'POST', path: '/app/signup', label: 'Create account + start session (JSON)' },
  { method: 'POST', path: '/app/login', label: 'Log in + start session (JSON)' },
  { method: 'POST', path: '/app/logout', label: 'Clear the session cookie (JSON)' },
  { method: 'GET', path: '/app/me/quotes', label: "Get the logged-in user's own quotes (JSON)" },
  { method: 'POST', path: '/app/quotes', label: 'Publish a quote (multipart/form-data, JSON)' },
  { method: 'GET', path: '/app/unsplash/search', label: 'Search Unsplash photos (JSON)' },
  { method: 'POST', path: '/app/unsplash/track-download', label: 'Track an Unsplash photo download (JSON)' },
];

module.exports = router;
