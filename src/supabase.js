import { createClient } from "@supabase/supabase-js";

const url = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) || 
  (typeof process !== "undefined" && process.env?.VITE_SUPABASE_URL) || 
  "https://tebtuzxafkymlplmlhzu.supabase.co";

const key = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_KEY) || 
  (typeof process !== "undefined" && process.env?.VITE_SUPABASE_KEY) || 
  "sb_publishable_grHTjPexU7_f9M8w4IrEYQ_o7_gx160";

export const supabase = createClient(url, key);
