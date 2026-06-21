-- international_orders RLS: add admin policies so /admin/international-orders
-- can read and manage every request, not just rows where user_id matches the
-- signed-in admin (which is never the case — customers submit these
-- anonymously or under their own user_id).
--
-- Existing policies:
--   - "international_orders open insert"  (anon + authenticated INSERT) ✓
--   - "international_orders own read"     (SELECT where user_id = auth.uid()) ✓
--
-- This migration adds:
--   - admin SELECT  → see every request
--   - admin UPDATE  → walk status through new → contacted → quoted → completed
--
-- Admin role is read from `public.profiles.role = 'admin'`, matching the
-- pattern used elsewhere in the app (see AuthContext + middleware).

CREATE POLICY "international_orders admin read"
  ON public.international_orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "international_orders admin update"
  ON public.international_orders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
