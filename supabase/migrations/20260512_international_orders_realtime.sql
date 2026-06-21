-- Add international_orders to the Supabase realtime publication so the
-- admin page (/admin/international-orders) can subscribe to live
-- INSERT/UPDATE events. New customer requests now appear in the admin
-- list without a manual refresh.
--
-- Existing RLS policies apply to realtime events too — admins receive
-- updates because they have the "admin read" SELECT policy; non-admins
-- only receive events for rows they own.

ALTER PUBLICATION supabase_realtime ADD TABLE public.international_orders;
