-- Skin Analyzer integration — additive schema (MadeNKorea / MySQL 8).
--
-- SAFE TO RUN ON PRODUCTION: creates four NEW tables only. Touches nothing
-- existing. Idempotent (CREATE TABLE IF NOT EXISTS). This mirrors the four
-- Prisma models appended to prisma/schema.prisma; after running it, execute
-- `npx prisma generate` (NOT `prisma db push`) so the client picks up the types
-- without diffing the rest of the introspected schema.
--
-- Apply:  mysql -u <user> -p madenkorea < db/migrations/20260710_skin_analyzer_integration.sql

SET NAMES utf8mb4;

-- Canonical stored analyses (one row per completed analysis).
CREATE TABLE IF NOT EXISTS `skin_analyses` (
  `id`                   CHAR(36)     NOT NULL,
  `user_id`              CHAR(36)     NOT NULL,
  `analyzer_analysis_id` VARCHAR(64)  NULL,
  `grant_id`             CHAR(36)     NOT NULL,
  `status`               VARCHAR(16)  NOT NULL DEFAULT 'pending',
  `kind`                 VARCHAR(16)  NOT NULL DEFAULT 'face',
  `summary`              JSON         NULL,
  `error`                TEXT         NULL,
  `created_at`           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `completed_at`         DATETIME(6)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `skin_analyses_analyzer_analysis_id_key` (`analyzer_analysis_id`),
  KEY `skin_analyses_user_created_idx` (`user_id`, `created_at`),
  KEY `skin_analyses_grant_idx` (`grant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-concern breakdown for an analysis.
CREATE TABLE IF NOT EXISTS `skin_analysis_issues` (
  `id`            CHAR(36)    NOT NULL,
  `analysis_id`   CHAR(36)    NOT NULL,
  `issue_type`    VARCHAR(64) NOT NULL,
  `score`         DOUBLE      NULL,
  `confidence`    DOUBLE      NULL,
  `severity_band` VARCHAR(16) NULL,
  `details`       JSON        NULL,
  PRIMARY KEY (`id`),
  KEY `skin_analysis_issues_analysis_idx` (`analysis_id`),
  CONSTRAINT `skin_analysis_issues_analysis_fk`
    FOREIGN KEY (`analysis_id`) REFERENCES `skin_analyses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Entitlement rows. The row id IS the token grant_id.
-- available -> reserved (Start) -> consumed (successful callback)
--                     \-> released (failure / TTL expiry).
CREATE TABLE IF NOT EXISTS `skin_entitlements` (
  `id`          CHAR(36)    NOT NULL,
  `user_id`     CHAR(36)    NOT NULL,
  `state`       VARCHAR(16) NOT NULL DEFAULT 'available',
  `source`      VARCHAR(16) NOT NULL DEFAULT 'free',
  `analysis_id` CHAR(36)    NULL,
  `reserved_at` DATETIME(6) NULL,
  `expires_at`  DATETIME(6) NULL,
  `consumed_at` DATETIME(6) NULL,
  `released_at` DATETIME(6) NULL,
  `created_at`  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `skin_entitlements_user_state_idx` (`user_id`, `state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Request more analyses" — approved by an admin in the MadeNKorea admin.
CREATE TABLE IF NOT EXISTS `skin_access_requests` (
  `id`          CHAR(36)    NOT NULL,
  `user_id`     CHAR(36)    NOT NULL,
  `status`      VARCHAR(16) NOT NULL DEFAULT 'pending',
  `note`        TEXT        NULL,
  `reviewed_by` CHAR(36)    NULL,
  `reviewed_at` DATETIME(6) NULL,
  `created_at`  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `skin_access_requests_user_status_idx` (`user_id`, `status`),
  KEY `skin_access_requests_status_created_idx` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
