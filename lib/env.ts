function optional(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function getPublicEnv() {
  return {
    supabaseUrl: optional("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: optional("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  };
}

export function getServerEnv() {
  return {
    supabaseUrl: optional("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: optional("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
    openAiApiKey: optional("OPENAI_API_KEY"),
    geminiApiKey: optional("GEMINI_API_KEY"),
    adminEmails: (optional("ADMIN_EMAILS") || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  };
}
