-- 任务目标:钉在任务列上方的阶段主线,可随时编辑内容与截止日,到期自动消失
-- 用法:supabase.com → SQL Editor → 运行本文件
create table goals (
  id         bigint generated always as identity primary key,
  owner      text not null check (owner in ('her', 'sup')),
  text       text not null,
  due        date not null,  -- 最后一天(含当天,按当事人时区),过了就不再显示
  created_at timestamptz not null default now()
);

alter table goals enable row level security;
create policy "anon all" on goals for all using (true) with check (true);
