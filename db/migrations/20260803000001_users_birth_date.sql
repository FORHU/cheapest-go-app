-- migrate:up
-- Account holders must be 18+ — they enter a payment contract when booking.
-- Stored so the attestation is auditable rather than only enforced at signup.
--
-- Nullable on purpose: accounts created before this rule have no date of birth
-- and must keep working. New signups are required to supply one by the API.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS birth_date DATE;

COMMENT ON COLUMN users.birth_date IS
    'Date of birth of the account holder. Required at signup (18+); NULL for accounts created before that rule.';

-- migrate:down
ALTER TABLE users DROP COLUMN IF EXISTS birth_date;
