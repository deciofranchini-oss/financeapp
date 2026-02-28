import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://rrdxukcfdpacnixqhgsp.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_7r4DiXpMK9KroZ-szGADEA_LkpfWhx0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);