-- Skin concern recommendations — admin-managed product mapping + per-concern
-- threshold. Additive, idempotent, safe on production. Two NEW tables only.
-- Apply:  mysql -u <user> -p <db> < db/migrations/20260716_skin_recommendations.sql
-- Then:   npx prisma generate

SET NAMES utf8mb4;

-- Per-concern threshold + on/off. A concern recommends products when a user's
-- health score for it is BELOW `threshold` (0-1, higher = healthier).
CREATE TABLE IF NOT EXISTS `skin_concern_settings` (
  `concern_type` VARCHAR(64)  NOT NULL,
  `threshold`    DOUBLE       NOT NULL DEFAULT 0.6,
  `enabled`      TINYINT(1)   NOT NULL DEFAULT 1,
  `updated_at`   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`concern_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- concern -> products mapping.
CREATE TABLE IF NOT EXISTS `skin_concern_products` (
  `id`           CHAR(36)    NOT NULL,
  `concern_type` VARCHAR(64) NOT NULL,
  `product_id`   CHAR(36)    NOT NULL,
  `position`     INT         NOT NULL DEFAULT 0,
  `created_at`   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `skin_concern_products_unique` (`concern_type`, `product_id`),
  KEY `skin_concern_products_concern_pos_idx` (`concern_type`, `position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
