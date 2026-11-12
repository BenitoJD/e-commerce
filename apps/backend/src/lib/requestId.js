// Request correlation for production debugging.
//
// Without an ID, a support message ("checkout failed at 3pm") can't be matched to a log
// line. Every request gets a short id, echoed in the response header and included in
// error bodies so a customer can quote it.
const crypto = require('crypto');

function makeRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

function requestId(req, res, next) {
  // Honour an upstream proxy's id when present so traces stay connected.
  const incoming = String(req.headers['x-request-id'] || '').trim();
  req.id = /^[A-Za-z0-9_-]{6,64}$/.test(incoming) ? incoming : makeRequestId();
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = { requestId, makeRequestId };
