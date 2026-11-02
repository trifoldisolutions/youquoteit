// Rerunnable content seed: pulls the Quotable dataset (2000+ quotes across
// 800+ authors — https://github.com/quotable-io/data, the same data that
// backed the now-dead api.quotable.io, fetched directly as static JSON since
// that hosted API no longer resolves at all) and loads them as real Quote
// documents, so a fresh install has actual content instead of the 6
// hardcoded SAMPLE_QUOTES in routes/app.js.
//
// Went with Quotable over the initial DummyJSON seed because DummyJSON's
// ~1200 usable quotes were heavily skewed toward a handful of authors (Rumi
// alone was 13% of the pool), which made autoplay's sequential advance look
// like it was looping between the same 2-3 names. Quotable's largest author
// is under 4% of its ~1600 usable quotes.
//
// Every run fully replaces prior seed content (wipes isSeed Quotes/Users,
// reloads from the source) rather than merging — this script always reflects
// "whatever the source has right now", never accumulates old generations.
// Real users' own accounts/quotes (isSeed: false) are never touched.
//
// Quote.authorUser is a required ref, so each distinct source author gets a
// synthetic User (isSeed: true, username prefixed "seed_" so it can never
// squat a name a real signup would want).
//
// Quotable also ships each quote pre-tagged against a ~67-term curated
// taxonomy (Wisdom, Love, Success, ...) — those become each Quote's
// hashtags, and Tag.quoteCount is recomputed from every quote's hashtags
// (seed and real alike) so hashtag search/autocomplete and any future
// recommendation logic have real category data to work with immediately.
//
// Usage: npm run seed:quotes
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Quote = require('../models/Quote');
const Tag = require('../models/Tag');

const SOURCE_URL = 'https://raw.githubusercontent.com/quotable-io/data/master/data/quotes.json';
const MAX_QUOTE_LENGTH = 110; // mirrors Quote.text's maxlength
const SEED_USERNAME_PREFIX = 'seed_';
// Mirrors HASHTAG_RE/MAX_HASHTAGS in routes/app.js.
const HASHTAG_RE = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/;
const MAX_HASHTAGS = 5;

const COMBINING_DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');

function slugifyAuthor(author) {
  const slug = author
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_RE, '') // strip diacritics (e.g. "Khattab" -> "Khattab")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'author';
}

// Quotable's tags are Title Case, sometimes multi-word ("Famous Quotes") —
// normalized the same way authors are, but hyphen-joined and validated
// against HASHTAG_RE so a tag we can't make legal is dropped rather than
// stored broken.
function slugifyTag(tag) {
  const slug = tag
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return HASHTAG_RE.test(slug) ? slug : null;
}

async function fetchSourceQuotes() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Quotable data fetch failed: ${res.status}`);
  const data = await res.json();
  // quotable's quotes.json is a flat array of { _id, content, author, tags }.
  return Array.isArray(data) ? data : [];
}

// One shared, unusable password hash for every seed account — nobody is meant
// to log into these, so a per-user random hash would just be wasted bcrypt work.
async function makeUnusablePasswordHash() {
  return bcrypt.hash(require('crypto').randomUUID(), 10);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'youquoteit' });
  console.log('Connected to MongoDB.');

  const raw = await fetchSourceQuotes();
  console.log(`Fetched ${raw.length} quotes from Quotable.`);

  const seenText = new Set();
  const usable = [];
  for (const q of raw) {
    const text = String(q.content || '').trim();
    const author = String(q.author || '').trim();
    if (!text || !author || text.length > MAX_QUOTE_LENGTH || seenText.has(text)) continue;
    seenText.add(text);
    const hashtags = [...new Set((Array.isArray(q.tags) ? q.tags : []).map(slugifyTag).filter(Boolean))]
      .slice(0, MAX_HASHTAGS);
    usable.push({ text, author, hashtags });
  }
  console.log(`${usable.length} fit the ${MAX_QUOTE_LENGTH}-char quote limit and aren't exact duplicates.`);

  // Multiple source strings can normalize to the same slug (e.g. two
  // punctuation variants of the same name) — they share one seed User, but
  // each Quote still keeps its own original authorName string.
  const authorEntries = [...new Map(usable.map(({ author }) => [slugifyAuthor(author), author])).entries()];

  const { deletedCount: quotesRemoved } = await Quote.deleteMany({ isSeed: true });
  const { deletedCount: usersRemoved } = await User.deleteMany({ isSeed: true });
  console.log(`Cleared ${quotesRemoved} previously seeded quotes and ${usersRemoved} seed accounts.`);

  const passwordHash = await makeUnusablePasswordHash();
  const insertedUsers = await User.insertMany(
    authorEntries.map(([slug, authorName]) => ({
      username: SEED_USERNAME_PREFIX + slug,
      authorName,
      email: `${slug}@seed.youquoteit.internal`,
      passwordHash,
      isSeed: true,
    }))
  );
  const userIdBySlug = new Map(authorEntries.map(([slug], i) => [slug, insertedUsers[i]._id]));
  console.log(`${authorEntries.length} seed author accounts created.`);

  const toInsert = usable.map(({ text, author, hashtags }) => ({
    text,
    authorUser: userIdBySlug.get(slugifyAuthor(author)),
    authorName: author,
    hashtags,
    isSeed: true,
  }));
  await Quote.insertMany(toInsert);
  console.log(`Inserted ${toInsert.length} quotes.`);

  const counts = await Quote.aggregate([
    { $match: { isSeed: true } },
    { $group: { _id: '$authorUser', count: { $sum: 1 } } },
  ]);
  await User.bulkWrite(
    counts.map(({ _id, count }) => ({
      updateOne: { filter: { _id }, update: { $set: { quoteCount: count } } },
    }))
  );
  console.log('Seed author quoteCounts refreshed.');

  // Recomputed (not incremented) from every quote's hashtags — seed and real
  // alike — so Tag.quoteCount stays authoritative no matter how many times
  // this script has rerun or what real users have separately published.
  const tagCounts = await Quote.aggregate([
    { $unwind: '$hashtags' },
    { $group: { _id: '$hashtags', count: { $sum: 1 } } },
  ]);
  await Tag.bulkWrite(
    tagCounts.map(({ _id, count }) => ({
      updateOne: {
        filter: { name: _id },
        update: { $set: { quoteCount: count }, $setOnInsert: { name: _id } },
        upsert: true,
      },
    }))
  );
  console.log(`Tag.quoteCount recomputed for ${tagCounts.length} tags.`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
