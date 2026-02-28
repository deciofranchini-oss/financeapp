import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://rrdxukcfdpacnixqhgsp.supabase.co";
// Cole aqui sua anon public key (Project Settings -> API -> anon public)
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyZHh1a2NmZHBhY25peHFoZ3NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNjk4NDEsImV4cCI6MjA4Nzg0NTg0MX0.n2fD3bqGoU62m8tKzfSRN2ofZcaEfZnTudyPS7Forck";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
