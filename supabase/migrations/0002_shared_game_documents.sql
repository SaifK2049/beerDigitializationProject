create table if not exists public.game_documents (
  id text primary key,
  code text not null unique,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.game_documents enable row level security;

drop policy if exists "public classroom read game documents" on public.game_documents;
drop policy if exists "public classroom insert game documents" on public.game_documents;
drop policy if exists "public classroom update game documents" on public.game_documents;
drop policy if exists "public classroom delete game documents" on public.game_documents;

create policy "public classroom read game documents"
  on public.game_documents for select
  to anon
  using (true);

create policy "public classroom insert game documents"
  on public.game_documents for insert
  to anon
  with check (true);

create policy "public classroom update game documents"
  on public.game_documents for update
  to anon
  using (true)
  with check (true);

create policy "public classroom delete game documents"
  on public.game_documents for delete
  to anon
  using (true);

create index if not exists game_documents_updated_at_idx
  on public.game_documents (updated_at desc);

do $$ begin
  alter publication supabase_realtime add table public.game_documents;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
