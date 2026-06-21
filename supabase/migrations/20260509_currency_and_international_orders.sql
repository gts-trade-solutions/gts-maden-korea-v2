-- ============================================================
-- Multi-currency display + international order request flow
-- ============================================================
--
-- 1) currency_rates    — display rates for all supported currencies.
--                        INR remains the canonical pricing column on
--                        `products`; rates here drive `useCurrency()`.
--
-- 2) international_orders — request log for visitors outside India who
--                            can't use the Razorpay flow. Customer
--                            submits a cart snapshot + contact info;
--                            the team replies manually with a quote.
--
-- Both tables seed-only, no destructive operations. Safe to re-run.

-- ----------------------------------------------------------------
-- currency_rates
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.currency_rates (
  code              text PRIMARY KEY,                 -- ISO 4217 (USD, EUR, ...)
  name              text NOT NULL,
  symbol            text NOT NULL,
  decimals          int  NOT NULL DEFAULT 2,
  rate_from_inr     numeric NOT NULL,                 -- 1 INR × rate = N target
  active            boolean NOT NULL DEFAULT true,
  last_updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Reasonable starting rates as of mid-2026. The pg_cron job (next
-- migration) refreshes these daily from frankfurter.app. Admin can
-- also trigger a manual refresh from /admin/settings/currencies.
INSERT INTO public.currency_rates (code, name, symbol, decimals, rate_from_inr)
VALUES
  ('INR', 'Indian Rupee',         '₹',   0, 1.000000),
  ('USD', 'US Dollar',            '$',   2, 0.012000),
  ('EUR', 'Euro',                 '€',   2, 0.011000),
  ('GBP', 'British Pound',        '£',   2, 0.009500),
  ('PLN', 'Polish Zloty',         'zł',  2, 0.048000),
  ('ZAR', 'South African Rand',   'R',   2, 0.220000),
  ('VND', 'Vietnamese Dong',      '₫',   0, 296.000000),
  ('TZS', 'Tanzanian Shilling',   'TSh', 0, 30.000000),
  ('NGN', 'Nigerian Naira',       '₦',   2, 19.500000),
  ('QAR', 'Qatari Riyal',         '﷼',   2, 0.044000),
  ('AED', 'UAE Dirham',           'د.إ', 2, 0.044000)
ON CONFLICT (code) DO NOTHING;

-- Public-read so the client can fetch the rate table. No writes
-- without service-role.
ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "currency_rates read" ON public.currency_rates;
CREATE POLICY "currency_rates read"
  ON public.currency_rates
  FOR SELECT
  TO anon, authenticated
  USING (active = true);


-- ----------------------------------------------------------------
-- international_orders
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.international_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lifecycle: new → contacted → quoted → completed | cancelled
  status            text NOT NULL DEFAULT 'new',
  customer_name     text NOT NULL,
  customer_email    text NOT NULL,
  customer_phone    text,
  country           text NOT NULL,                   -- ISO 3166-1 alpha-2
  address           jsonb NOT NULL,                  -- full international address
  cart_snapshot     jsonb NOT NULL,                  -- line items + prices in INR + display
  currency_code     text NOT NULL,                   -- whichever currency the customer was viewing
  display_total     numeric,                         -- total in their currency at request time
  inr_total         numeric,                         -- equivalent in INR for ops
  notes             text,
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS international_orders_status_idx
  ON public.international_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS international_orders_user_idx
  ON public.international_orders (user_id);

CREATE INDEX IF NOT EXISTS international_orders_email_idx
  ON public.international_orders (lower(customer_email));

-- RLS: customers can read their own requests when signed in; admins
-- (service role) have full access via the admin clients. Anyone can
-- INSERT (the request modal is open to anonymous visitors too).
ALTER TABLE public.international_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "international_orders own read" ON public.international_orders;
CREATE POLICY "international_orders own read"
  ON public.international_orders
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "international_orders open insert" ON public.international_orders;
CREATE POLICY "international_orders open insert"
  ON public.international_orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.touch_international_orders_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_international_orders_updated_at ON public.international_orders;
CREATE TRIGGER trg_international_orders_updated_at
  BEFORE UPDATE ON public.international_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_international_orders_updated_at();
