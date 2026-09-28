import { createClient } from "@supabase/supabase-js";

const env = typeof import.meta !== "undefined" ? import.meta.env : undefined;
const nodeEnv = typeof globalThis !== "undefined" && globalThis.process ? globalThis.process.env : undefined;

const url = env?.VITE_SUPABASE_URL || nodeEnv?.VITE_SUPABASE_URL || "https://tebtuzxafkymlplmlhzu.supabase.co";
const key = env?.VITE_SUPABASE_KEY || nodeEnv?.VITE_SUPABASE_KEY || "sb_publishable_grHTjPexU7_f9M8w4IrEYQ_o7_gx160";

export const supabase = createClient(url, key);
