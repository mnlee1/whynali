CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO admin_settings (key, value, updated_at) 
VALUES ('safety_bot_enabled', 'true', NOW())
ON CONFLICT (key) DO NOTHING;
