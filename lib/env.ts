function optional(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function getPublicEnv() {
  return {
    appUrl: optional("NEXT_PUBLIC_APP_URL"),
    supabaseUrl: optional("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: optional("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  };
}

export function getServerEnv() {
  return {
    appUrl: optional("NEXT_PUBLIC_APP_URL") || optional("APP_URL"),
    supabaseUrl: optional("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: optional("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
    geminiApiKey: optional("GEMINI_API_KEY"),
    deepseekApiKey: optional("DEEPSEEK_API_KEY"),
    openRouterApiKey: optional("OPENROUTER_API_KEY"),
    mapplsPublicKey: optional("MAPPLS_PUBLIC_KEY"),
    greMailClientId: optional("GRE_MAIL_CLIENT_ID"),
    greMailClientSecret: optional("GRE_MAIL_CLIENT_SECRET"),
    greMailRefreshToken: optional("GRE_MAIL_REFRESH_TOKEN"),
    greMailAccessToken: optional("GRE_MAIL_ACCESS_TOKEN"),
    greMailSender: optional("GRE_MAIL_SENDER"),
    adminEmails: (optional("ADMIN_EMAILS") || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  };
}
