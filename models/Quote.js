const mongoose = require('mongoose');

// authorName is a snapshot taken at publish time (mirrors the in-memory
// version this replaces) rather than always resolving through authorUser,
// so a quote's byline stays what it was when published.
const quoteSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 110 },
  authorUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String, required: true },
  bgImage: { type: String, default: null },
  bgCredit: {
    type: new mongoose.Schema({
      name: String,
      link: String,
    }, { _id: false }),
    default: null,
  },
  bgPosition: { type: String, default: '50% 50%' },
  hashtags: { type: [String], default: [] },
  showAppreciations: { type: Boolean, default: true },
  showDisapprovals: { type: Boolean, default: true },
  allowComments: { type: Boolean, default: true },
  allowSnapshots: { type: Boolean, default: true },
  matureAudience: { type: Boolean, default: false },
  // Display-only counters — nothing increments these yet (no likes/comments/
  // views/screenshots backend exists), same stub state as the in-memory
  // quotes this model replaces.
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  screenshots: { type: Number, default: 0 },
  // True for quotes scripts/seed-quotes.js imported rather than a user publishing
  // one via POST /quotes — lets that script find its own prior inserts on rerun
  // without touching real content, and gives future cleanup/admin tooling a way
  // to tell imported content apart from what people actually published here.
  isSeed: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Quote', quoteSchema);
