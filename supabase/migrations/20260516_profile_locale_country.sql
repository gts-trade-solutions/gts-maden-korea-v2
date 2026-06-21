-- Per-user persistence for the country / locale / currency preferences
-- that the multi-country CountrySwitcher reads + writes on the
-- customer-facing storefront. Nullable so customers signed up before
-- this feature don't need backfill — the cookies still drive UX, and
-- the profile sync just kicks in the next time they touch the
-- switcher or sign in fresh.
--
-- Indexed `preferred_locale` because analytics will likely want to
-- segment customers by language (e.g., who actually browses in PL vs
-- en-IN).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_locale  text,
  ADD COLUMN IF NOT EXISTS preferred_country text;

CREATE INDEX IF NOT EXISTS profiles_preferred_locale_idx
  ON public.profiles(preferred_locale);
