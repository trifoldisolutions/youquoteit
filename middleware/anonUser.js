const mongoose = require('mongoose');
const AnonUser = require('../models/AnonUser');

const COOKIE_NAME = 'anon_id';
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // mirrors AnonUser's TTL index

// Identifies first-time visitors, creating an AnonUser doc + cookie for them.
// Every visit touches updatedAt, which both the doc's TTL index and the
// cookie's max-age key off — so activity within the window keeps sliding it.
// Mounted once globally in server.js; skips the internal-only admin facade so
// its traffic doesn't pollute visitor tracking.
async function anonUser(req, res, next) {
  if (req.path.startsWith('/admin')) {
    return next();
  }

  try {
    const cookieId = req.cookies[COOKIE_NAME];
    let anon = mongoose.isValidObjectId(cookieId)
      ? await AnonUser.findByIdAndUpdate(cookieId, {}, { new: true })
      : null;

    if (!anon) {
      anon = await AnonUser.create({});
    }

    res.cookie(COOKIE_NAME, anon.id, { maxAge: MAX_AGE_MS, httpOnly: true, sameSite: 'lax' });
    req.anonUser = anon;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = anonUser;
