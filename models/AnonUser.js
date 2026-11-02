const mongoose = require('mongoose');

const ANON_TTL_SECONDS = 6 * 60 * 60; // 6 hours

const anonUserSchema = new mongoose.Schema({}, { timestamps: true });

// Expires the document 6h after its last touch (updatedAt), so activity
// within the window keeps extending it rather than capping at createdAt.
anonUserSchema.index({ updatedAt: 1 }, { expireAfterSeconds: ANON_TTL_SECONDS });

module.exports = mongoose.model('AnonUser', anonUserSchema);
