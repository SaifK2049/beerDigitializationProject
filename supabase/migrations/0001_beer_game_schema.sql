create extension if not exists "pgcrypto";

do $$ begin
  create type game_status as enum ('lobby', 'active', 'paused', 'finished');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type supply_chain_role as enum ('retailer', 'wholesaler', 'distributor', 'producer');
exception when duplicate_object then null;
end $$;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null default 'Beer Game',
  status game_status not null default 'lobby',
  current_round integer not null default 0,
  max_rounds integer not null default 20,
  admin_pin_hash text not null,
  transparency_level text not null default 'local_structured',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.game_configs (
  game_id uuid primary key references public.games(id) on delete cascade,
  inventory_cost_per_unit numeric(10,2) not null default 1,
  backorder_cost_per_unit numeric(10,2) not null default 2,
  starting_inventory integer not null default 12,
  starting_transport integer not null default 4,
  starting_wareneingang integer not null default 4,
  target_safety_stock integer not null default 4,
  moving_average_window integer not null default 3,
  max_order_quantity integer,
  round_seconds integer not null default 60,
  initial_incoming_order integer not null default 4,
  timeout_fallback text not null default 'previous_order_or_zero',
  demo_mode boolean not null default false,
  demo_customer_demand integer[] not null default '{4,4,4,4,8,8,8,8,4,4,4,4}'
);

create table if not exists public.role_assignments (
  game_id uuid not null references public.games(id) on delete cascade,
  role supply_chain_role not null,
  display_name text not null default '',
  role_pin_hash text not null,
  user_id uuid references auth.users(id),
  joined_at timestamptz,
  primary key (game_id, role)
);

create table if not exists public.rounds (
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null,
  status text not null default 'active',
  starts_at timestamptz not null,
  deadline_at timestamptz not null,
  locked_at timestamptz,
  advanced_by text,
  primary key (game_id, round_number)
);

create table if not exists public.role_round_states (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null,
  role supply_chain_role not null,
  starting_inventory integer not null,
  transport_buffer_before integer not null,
  wareneingang_buffer_before integer not null,
  material_moved_to_inventory integer not null,
  material_moved_to_wareneingang integer not null,
  incoming_order integer,
  incoming_order_source text not null,
  previous_backorder integer not null,
  total_demand integer,
  shipped_quantity integer,
  ending_inventory integer,
  ending_backorder integer,
  new_order_to_supplier integer,
  recommended_order_quantity integer not null default 0,
  recommendation_reason text not null default '',
  recommendation_inputs jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  inventory_cost numeric(10,2),
  backorder_cost numeric(10,2),
  total_round_cost numeric(10,2),
  submitted_by text,
  submitted_at timestamptz,
  submitted boolean not null default false,
  timed_out boolean not null default false,
  unique (game_id, round_number, role),
  check (incoming_order is null or incoming_order >= 0),
  check (new_order_to_supplier is null or new_order_to_supplier >= 0),
  check (
    ending_inventory is null
    or ending_backorder is null
    or ending_inventory = 0
    or ending_backorder = 0
  )
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null,
  from_role text not null,
  to_role text not null,
  quantity integer not null check (quantity >= 0),
  becomes_visible_round integer not null
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null,
  from_role text not null,
  to_role text not null,
  quantity integer not null check (quantity >= 0),
  enters_transport_round integer not null
);

create table if not exists public.pipeline_states (
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null,
  role supply_chain_role not null,
  transport_quantity integer not null default 0,
  wareneingang_quantity integer not null default 0,
  primary key (game_id, round_number, role)
);

create table if not exists public.cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null,
  role supply_chain_role not null,
  inventory_cost numeric(10,2) not null,
  backorder_cost numeric(10,2) not null,
  total_round_cost numeric(10,2) not null,
  cumulative_cost numeric(10,2) not null
);

create table if not exists public.decision_recommendations (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null,
  role supply_chain_role not null,
  recommended_quantity integer not null,
  formula_inputs jsonb not null default '{}'::jsonb,
  explanation text not null
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists role_round_states_lookup_idx
  on public.role_round_states (game_id, round_number, role);

create index if not exists orders_visibility_idx
  on public.orders (game_id, becomes_visible_round, to_role);

create index if not exists shipments_transport_idx
  on public.shipments (game_id, enters_transport_round, to_role);

alter table public.games enable row level security;
alter table public.game_configs enable row level security;
alter table public.role_assignments enable row level security;
alter table public.rounds enable row level security;
alter table public.role_round_states enable row level security;
alter table public.orders enable row level security;
alter table public.shipments enable row level security;
alter table public.pipeline_states enable row level security;
alter table public.cost_snapshots enable row level security;
alter table public.decision_recommendations enable row level security;
alter table public.audit_logs enable row level security;

create policy "authenticated users can create games"
  on public.games for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "game creator can manage games"
  on public.games for all
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "game creator can manage child rows"
  on public.game_configs for all
  to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and g.created_by = auth.uid()))
  with check (exists (select 1 from public.games g where g.id = game_id and g.created_by = auth.uid()));

create policy "assigned users can read own role state"
  on public.role_round_states for select
  to authenticated
  using (
    exists (
      select 1 from public.role_assignments ra
      where ra.game_id = role_round_states.game_id
        and ra.role = role_round_states.role
        and ra.user_id = auth.uid()
    )
    or exists (select 1 from public.games g where g.id = game_id and g.created_by = auth.uid())
  );

create policy "game creator can manage role states"
  on public.role_round_states for all
  to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and g.created_by = auth.uid()))
  with check (exists (select 1 from public.games g where g.id = game_id and g.created_by = auth.uid()));
