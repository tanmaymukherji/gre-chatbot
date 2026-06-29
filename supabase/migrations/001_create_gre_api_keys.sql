-- Migration: Create gre_api_keys table for AskGRE Match API key management
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS gre_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_hash TEXT NOT NULL,
  api_key_prefix TEXT NOT NULL,
  org_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

-- Index for fast prefix lookup during key validation
CREATE INDEX IF NOT EXISTS gre_api_keys_prefix_idx ON gre_api_keys(api_key_prefix);

-- Row Level Security
ALTER TABLE gre_api_keys ENABLE ROW LEVEL SECURITY;

-- Admin users (authenticated via GramEEE) can do anything
CREATE POLICY "gre_api_keys_admin_full" ON gre_api_keys
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.app_metadata->>'grameee_role' = 'admin'
    )
  );

-- No public access
CREATE POLICY "gre_api_keys_no_public" ON gre_api_keys
  FOR SELECT
  TO public
  USING (false);

COMMENT ON TABLE gre_api_keys IS 'API keys for the AskGRE solution matching public API';