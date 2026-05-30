-- Admin account: zx / `12
-- Password hash is bcrypt of "`12" - will be generated at runtime
-- For seed, we use a placeholder that will be replaced on first run
INSERT OR IGNORE INTO users (username, password_hash, is_admin, is_active, expires_at)
VALUES ('zx', '$2a$10$PLACEHOLDER_CHANGE_ME', 1, 1, '2099-12-31T23:59:59');
