create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text null,
  subject text null,
  message text not null,
  status text null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_messages_created_at
  on public.contact_messages (created_at desc);
