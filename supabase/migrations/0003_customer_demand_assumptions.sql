alter table public.games
  alter column max_rounds set default 26;

alter table public.game_configs
  add column if not exists customer_demand_minimum integer not null default 0,
  add column if not exists customer_demand_maximum integer not null default 16,
  add column if not exists customer_demand_standard_deviation numeric(10,2) not null default 2.59;
