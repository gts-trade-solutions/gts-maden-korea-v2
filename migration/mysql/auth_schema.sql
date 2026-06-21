-- ===========================================================================
-- NextAuth (Auth.js) tables for MySQL — the replacement for Supabase Auth.
-- Columns are snake_case; the Prisma models @map them to the camelCase field
-- names the Auth.js Prisma adapter expects (userId, providerAccountId, …).
--
-- auth_users.id == the old Supabase auth.users.id == public.profiles.id, so the
-- existing profiles rows stay linked by id (no FK across the boundary).
-- password_hash holds the migrated bcrypt hash (credentials login, no reset).
-- ===========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS auth_accounts;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS auth_verification_tokens;
DROP TABLE IF EXISTS auth_users;

CREATE TABLE auth_users (
  id             CHAR(36)      NOT NULL,
  name           VARCHAR(255)  NULL,
  email          VARCHAR(255)  NULL,
  email_verified DATETIME(6)   NULL,
  image          VARCHAR(1024) NULL,
  password_hash  VARCHAR(255)  NULL,
  created_at     DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY auth_users_email_key (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE auth_accounts (
  id                  CHAR(36)     NOT NULL,
  user_id             CHAR(36)     NOT NULL,
  type                VARCHAR(255) NOT NULL,
  provider            VARCHAR(255) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  refresh_token       TEXT         NULL,
  access_token        TEXT         NULL,
  expires_at          INT          NULL,
  token_type          VARCHAR(255) NULL,
  scope               VARCHAR(255) NULL,
  id_token            TEXT         NULL,
  session_state       VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY auth_accounts_provider_key (provider, provider_account_id),
  KEY auth_accounts_user_idx (user_id),
  CONSTRAINT auth_accounts_user_fk FOREIGN KEY (user_id)
    REFERENCES auth_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE auth_sessions (
  id            CHAR(36)     NOT NULL,
  session_token VARCHAR(255) NOT NULL,
  user_id       CHAR(36)     NOT NULL,
  expires       DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY auth_sessions_token_key (session_token),
  KEY auth_sessions_user_idx (user_id),
  CONSTRAINT auth_sessions_user_fk FOREIGN KEY (user_id)
    REFERENCES auth_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE auth_verification_tokens (
  identifier VARCHAR(255) NOT NULL,
  token      VARCHAR(255) NOT NULL,
  expires    DATETIME(6)  NOT NULL,
  PRIMARY KEY (identifier, token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;
