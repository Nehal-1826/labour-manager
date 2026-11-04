/* Supabase Auth guard — protects every /api route.
 *
 * Verifies the request's Bearer access token with supabase.auth.getUser(token)
 * and allows ONLY the configured administrator (ADMIN_UID). The publishable
 * (anon) key is used here — the service-role key is never needed or loaded.
 *
 * SECURITY ENFORCEMENT IS SERVER-SIDE ONLY. Any frontend check is UX sugar.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const ADMIN_UID = process.env.ADMIN_UID;

// fail fast with a clear message instead of serving an unauthenticated API
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !ADMIN_UID) {
  console.error(
    'Missing authentication configuration.\n' +
    'Create a .env file at the project root (see .env.example) containing:\n' +
    '  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ADMIN_UID\n' +
    'Server will not start until these are set.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    if (data.user.id !== ADMIN_UID) {
      return res.status(403).json({ error: 'Forbidden: administrator account required.' });
    }

    req.user = { id: data.user.id, email: data.user.email };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(401).json({ error: 'Authentication check failed.' });
  }
}

module.exports = requireAdmin;
