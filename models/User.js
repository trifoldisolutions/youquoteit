const mongoose = require('mongoose');

// Case-insensitive uniqueness on username/email is enforced in routes/app.js
// via a regex lookup before insert, plus this unique index as the DB-level
// backstop for the race between that check and the insert.
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, minlength: 2 },
  authorName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  // Incremented via $inc whenever this user publishes a Quote — mirrors
  // Tag.quoteCount's own $inc pattern. Used to show a real authorQuoteCount
  // on quotes instead of a hardcoded value.
  quoteCount: { type: Number, default: 0 },
  // True only for the synthetic per-author accounts scripts/seed-quotes.js
  // creates to hold imported quotes' required authorUser ref — never set for
  // an account created via /signup. passwordHash is an unusable random value
  // for these, so nothing else needs to check this flag to keep them un-loggable-into.
  isSeed: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
