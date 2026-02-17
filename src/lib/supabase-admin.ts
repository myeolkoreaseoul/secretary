import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || "";

/**
 * Server-side Supabase client using service_role key.
 * Bypasses RLS — use only in API routes and Server Components.
 * Falls back to anon key during build if service key is not available.
 */
export const supabaseAdmin = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
