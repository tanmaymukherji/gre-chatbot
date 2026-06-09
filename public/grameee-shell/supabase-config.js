window.grameeeSupabase = (() => {
  const SUPABASE_URL = "https://zphabezqbboaexmmhcic.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwaGFiZXpxYmJvYWV4bW1oY2ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTY5MTgsImV4cCI6MjA5MTczMjkxOH0.cHZCuzwiAEEQjPo6WAADaD5oBZapFmk45dOe4A4g37U";

  function createClient() {
    if (!window.supabase?.createClient) {
      return null;
    }

    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
  }

  return {
    createClient,
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY
  };
})();
