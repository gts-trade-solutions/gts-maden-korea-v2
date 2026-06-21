-- C-40 fix: invoice_companies stores account_number + swift_code and
-- was reachable through PostgREST without RLS. Enable RLS and gate
-- access to admins only — the table is read/written exclusively by
-- /admin/invoices/* pages.

alter table public.invoice_companies enable row level security;

drop policy if exists "admin all invoice_companies" on public.invoice_companies;

create policy "admin all invoice_companies"
  on public.invoice_companies
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
