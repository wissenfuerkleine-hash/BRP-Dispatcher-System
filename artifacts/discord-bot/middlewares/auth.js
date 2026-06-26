/**
 * Simple token-based auth middleware for the dashboard API.
 * Set DASHBOARD_SECRET in your .env. All mutating/upload endpoints
 * require the header:  Authorization: Bearer <your-secret>
 *
 * The GET /  and GET /api/* read-only routes are intentionally public
 * so the live dashboard view works without creds, but every write
 * and upload action is gated.
 */
function requireSecret(req, res, next) {
  const secret = process.env.DASHBOARD_SECRET;

  // If no secret is configured, block all writes with a clear message.
  if (!secret) {
    return res.status(503).json({
      error: 'DASHBOARD_SECRET env var is not set. Dashboard writes are disabled.',
    });
  }

  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;

  if (token !== secret) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing token.' });
  }

  next();
}

module.exports = { requireSecret };
