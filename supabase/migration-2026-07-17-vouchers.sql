-- 兑奖券:她的累计积分每满 1500,历史总积分开始"呼吸",点开宝箱领一张券。
-- milestone 唯一约束防止两台设备同时开箱重复领取。
create table vouchers (
  id         bigint generated always as identity primary key,
  milestone  int  not null unique,   -- 1500 / 3000 / 4500 ...
  serial     text not null,          -- 券号,含领取日期(北京时间)
  claimed_at timestamptz not null default now()
);

alter table vouchers enable row level security;
create policy "anon all" on vouchers for all using (true) with check (true);
