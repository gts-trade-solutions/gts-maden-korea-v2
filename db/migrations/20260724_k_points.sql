-- K-Points reward system — Phase 1 tables. Idempotent (IF NOT EXISTS).
-- See K_POINTS.md for the full spec.

CREATE TABLE IF NOT EXISTS `k_points_ledger` (
  `id`          CHAR(36)     NOT NULL,
  `user_id`     CHAR(36)     NOT NULL,
  `delta`       INT          NOT NULL,
  `reason`      VARCHAR(32)  NOT NULL,
  `source_type` VARCHAR(32)  NOT NULL,
  `source_id`   VARCHAR(64)  NOT NULL,
  `status`      VARCHAR(16)  NOT NULL DEFAULT 'available',
  `expires_at`  DATETIME(6)  NULL,
  `meta`        JSON         NULL,
  `created_at`  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `k_points_ledger_source_unique` (`source_type`, `source_id`, `reason`),
  KEY `k_points_ledger_user_created_idx` (`user_id`, `created_at`),
  KEY `k_points_ledger_status_expires_idx` (`status`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `k_points_balance` (
  `user_id`         CHAR(36)    NOT NULL,
  `available`       INT         NOT NULL DEFAULT 0,
  `reserved`        INT         NOT NULL DEFAULT 0,
  `lifetime_earned` INT         NOT NULL DEFAULT 0,
  `lifetime_spent`  INT         NOT NULL DEFAULT 0,
  `version`         INT         NOT NULL DEFAULT 0,
  `updated_at`      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `k_points_currency_rates` (
  `currency_code`   VARCHAR(8)     NOT NULL,
  `points_per_unit` DECIMAL(20, 6) NOT NULL,
  `is_auto`         TINYINT(1)     NOT NULL DEFAULT 1,
  `updated_at`      DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`currency_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `k_points_rules` (
  `action_key` VARCHAR(32)    NOT NULL,
  `mode`       VARCHAR(16)    NOT NULL DEFAULT 'flat',
  `value`      DECIMAL(20, 6) NOT NULL DEFAULT 0,
  `enabled`    TINYINT(1)     NOT NULL DEFAULT 0,
  `one_time`   TINYINT(1)     NOT NULL DEFAULT 0,
  `updated_at` DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`action_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `k_points_settings` (
  `id`                        SMALLINT       NOT NULL DEFAULT 1,
  `base_currency`             VARCHAR(8)     NOT NULL DEFAULT 'USD',
  `base_points_per_unit`      DECIMAL(20, 6) NOT NULL DEFAULT 500,
  `redeem_cap_percent`        SMALLINT       NOT NULL DEFAULT 20,
  `redeem_min_points`         INT            NOT NULL DEFAULT 0,
  `points_expiry_days`        INT            NOT NULL DEFAULT 365,
  `skin_analyzer_cost_points` INT            NOT NULL DEFAULT 0,
  `earn_on_net`               TINYINT(1)     NOT NULL DEFAULT 1,
  `updated_at`                DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_by`                CHAR(36)       NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the singleton settings row and default earn rules (disabled until the
-- admin sets values + enables them).
INSERT IGNORE INTO `k_points_settings` (`id`) VALUES (1);
INSERT IGNORE INTO `k_points_rules` (`action_key`, `mode`, `value`, `enabled`, `one_time`) VALUES
  ('purchase', 'percent', 0, 0, 0),
  ('signup',   'flat',    0, 0, 1),
  ('review',   'flat',    0, 0, 0),
  ('referral', 'flat',    0, 0, 0);
