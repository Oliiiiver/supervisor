-- 领奖登记:第三张兑奖券(累计 4500 分)得先登记尺寸才能收下。
-- 奖品按尺寸定做,她填哪只手哪根手指、几号、或者量出来的指围。
-- milestone 唯一,一档只登记一次。
create table size_registry (
  id         bigint generated always as identity primary key,
  milestone  int  not null unique,        -- 触发登记的那一档(目前只有 4500)
  hand       text not null default '',    -- 左手 / 右手
  finger     text not null default '',    -- 拇指 / 食指 / 中指 / 无名指 / 小指
  ring_size  text not null default '',    -- 她知道的号数,原样存(可能写"港版12号"之类)
  mm         numeric,                     -- 纸条量出来的指围,毫米
  note       text not null default '',
  created_at timestamptz not null default now()
);

alter table size_registry enable row level security;
create policy "anon all" on size_registry for all using (true) with check (true);
