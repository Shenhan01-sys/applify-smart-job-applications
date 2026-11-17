import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://dreexbadvlxufkrvvwrq.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyZWV4YmFkdmx4dWZrcnZ2d3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwODM2ODQsImV4cCI6MjA5NDY1OTY4NH0.e37-d4E6fFSF2Bc-HeriJbG562Q9FqzhB4GciAtaVUE";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
