const mongoose = require('mongoose');

// name is already normalized (lowercase, #-stripped) client-side before it
// ever reaches here — see normalizeHashtag/HASHTAG_RE in public/js/app.js —
// so the unique index below also doubles as the case-insensitive dedupe key.
const tagSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, minlength: 1, maxlength: 24 },
  quoteCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Tag', tagSchema);
