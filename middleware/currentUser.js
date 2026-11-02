const mongoose = require('mongoose');
const User = require('../models/User');

const COOKIE_NAME = 'uid';

// Identifies a logged-in visitor from the signed session cookie set by
// POST /app/login and /app/signup. Attaches the User doc as req.user
// (null for a signed-out visitor, or a stale/invalid cookie — which this
// also clears so it doesn't keep getting sent).
async function currentUser(req, res, next) {
  const userId = req.signedCookies[COOKIE_NAME];
  if (!userId || !mongoose.isValidObjectId(userId)) {
    req.user = null;
    return next();
  }

  try {
    req.user = await User.findById(userId).select('username authorName email quoteCount').lean();
    if (!req.user) res.clearCookie(COOKIE_NAME);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = currentUser;
