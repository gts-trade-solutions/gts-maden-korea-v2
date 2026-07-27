-- Phase 3: K-Points buy-with-money packs + purchase orders. Idempotent.
CREATE TABLE IF NOT EXISTS `k_points_packs` (
  `id`           CHAR(36)     NOT NULL,
  `points`       INT          NOT NULL,
  `bonus_points` INT          NOT NULL DEFAULT 0,
  `price_inr`    DECIMAL(12,2) NOT NULL,
  `active`       TINYINT(1)   NOT NULL DEFAULT 1,
  `position`     INT          NOT NULL DEFAULT 0,
  `created_at`   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `k_points_purchase_orders` (
  `id`                CHAR(36)     NOT NULL,
  `user_id`           CHAR(36)     NOT NULL,
  `pack_id`           CHAR(36)     NULL,
  `points`            INT          NOT NULL,
  `amount`            DECIMAL(12,2) NOT NULL,
  `currency`          VARCHAR(8)   NOT NULL DEFAULT 'INR',
  `razorpay_order_id` VARCHAR(64)  NULL,
  `status`            VARCHAR(16)  NOT NULL DEFAULT 'created',
  `created_at`        DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `paid_at`           DATETIME(6)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `k_points_purchase_orders_rzp_unique` (`razorpay_order_id`),
  KEY `k_points_purchase_orders_user_idx` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
