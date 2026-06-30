import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function getUserId() {
  const KEY = "ici_user_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "u_" + crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
