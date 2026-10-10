-- Remove the retired showcase system and its stored state.
drop table if exists public.curio_shelf_log;
drop table if exists public.curio_tiers;
drop table if exists public.curio_shelf;
drop table if exists public.curio_draws;
drop table if exists public.curio_owned;