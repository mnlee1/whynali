CREATE TABLE admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO admin_settings VALUES ('safety_bot_enabled', 'true', NOW());
