import { createClient } from "@supabase/supabase-js";

// The publishable (anon) key is public by design. Row Level Security decides what it can reach.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
