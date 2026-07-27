-- Phase 2: K-Points redemption columns on orders. Idempotent-ish; run once.
-- (MySQL lacks ADD COLUMN IF NOT EXISTS across all versions, so guard manually
--  if re-running.)
ALTER TABLE `orders`
  ADD COLUMN `points_redeemed_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `points_redeemed_qty`    INT           NOT NULL DEFAULT 0,
  ADD COLUMN `points_earned`          INT           NOT NULL DEFAULT 0,
  ADD COLUMN `order_kind`             VARCHAR(16)   NOT NULL DEFAULT 'product';
