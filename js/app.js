/*
PATCH APPLIED: Automatic Supabase configuration
Priority order:
1. js/supabase-config.js
2. localStorage values
*/

const SUPABASE_URL =
  window.SUPABASE_CONFIG?.url ||
  localStorage.getItem("supabase_url");

const SUPABASE_KEY =
  window.SUPABASE_CONFIG?.anonKey ||
  localStorage.getItem("supabase_key");

if(!SUPABASE_URL || !SUPABASE_KEY){
  console.warn("Supabase configuration missing.");
}

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);
