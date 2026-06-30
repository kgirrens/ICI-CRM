javascriptimport { createClient } from "@supabase/supabase-js";

// These are filled in from your .env file (or Vercel environment variables).
// NEVER hard-code real values here — use the env vars below.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Returns a stable anonymous user ID for this browser.
 * Stored in localStorage so it persists across sessions.
 * Each user gets their own row in the database — no accounts or login required.
 */
export function getUserId() {
  const KEY = "ici_user_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "u_" + crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
