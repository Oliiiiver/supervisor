-- Supervisor · 考公陪跑台 — Supabase 数据库结构
-- 用法:supabase.com 新建项目 → SQL Editor → 粘贴本文件全部内容运行
-- 然后把 Project URL 和 anon key 填进 js/config.js

create table settings (
  id            int primary key default 1 check (id = 1),  -- 单行表
  exam_name     text not null default '',
  exam_date     date,
  current_phase bigint,  -- 当前阶段的 phases.id
  ashore        boolean not null default false  -- 上岸,「一鸣惊人」由监督员手动颁发
);

create table phases (
  id   bigint generated always as identity primary key,
  name text not null,
  sort int  not null default 0
);

create table tasks (
  id        bigint generated always as identity primary key,
  date      date not null,
  title     text not null,
  owner     text not null default 'her' check (owner in ('her', 'sup')), -- 备考任务 / 陪跑任务
  points    int  not null default 0,   -- 分值由监督员赋,0 = 待赋分(陪跑任务恒为 0)
  done      boolean not null default false,
  done_at   timestamptz,
  dismissed boolean not null default false, -- 逾期账被监督员销掉
  liked     boolean not null default false, -- 监督员点赞
  created_at timestamptz not null default now() -- 「一日之际」成就用
);

create table rewards (
  id     bigint generated always as identity primary key,
  title  text not null,
  cost   int  not null,
  active boolean not null default true
);

create table ledger (
  id         bigint generated always as identity primary key,
  delta      int  not null,               -- 正数加分,负数扣分
  reason     text not null,
  kind       text not null check (kind in ('task', 'redeem')),
  task_id    bigint references tasks (id),
  reward_id  bigint references rewards (id),
  created_at timestamptz not null default now()
);

-- 专项刷题记录(当前阶段的核心数据)
create table drills (
  id      bigint generated always as identity primary key,
  date    date not null,
  module  text not null check (module in ('zhengzhi', 'changshi', 'yanyu', 'shuliang', 'panduan', 'ziliao')),
  total   int  not null check (total > 0),    -- 题数
  correct int  not null check (correct >= 0), -- 对了几题
  liked   boolean not null default false       -- 监督员点赞
);

create table mock_exams (
  id       bigint generated always as identity primary key,
  date     date not null,
  changshi int,   -- 常识正确率 %
  yanyu    int,   -- 言语正确率 %
  shuliang int,   -- 数量正确率 %
  panduan  int,   -- 判断正确率 %
  ziliao   int,   -- 资料正确率 %
  shenlun  int,   -- 申论分数
  notes    text not null default ''
);

-- 留言板
create table messages (
  id         bigint generated always as identity primary key,
  text       text not null,
  created_at timestamptz not null default now()
);

-- 成就解锁记录(解锁即永久,数据变化不会收回)
create table badge_unlocks (
  badge_id    text primary key,
  unlocked_at timestamptz not null default now()
);

-- 初始数据
insert into phases (name, sort) values
  ('理论学习', 1),
  ('专项刷题', 2),
  ('查缺补漏', 3),
  ('定时刷题', 4);

insert into settings (id, exam_name, exam_date, current_phase)
  values (1, '', null, (select id from phases where sort = 2));

insert into rewards (title, cost) values ('休息半天', 500);

-- 简化的访问控制:两人小工具,开放匿名读写。
-- 站点 URL 不外传即可;如需更严格,给两人建账号并改用 auth 策略。
alter table settings   enable row level security;
alter table phases     enable row level security;
alter table tasks      enable row level security;
alter table rewards    enable row level security;
alter table ledger     enable row level security;
alter table drills        enable row level security;
alter table mock_exams    enable row level security;
alter table messages      enable row level security;
alter table badge_unlocks enable row level security;

create policy "anon all" on settings      for all using (true) with check (true);
create policy "anon all" on phases        for all using (true) with check (true);
create policy "anon all" on tasks         for all using (true) with check (true);
create policy "anon all" on rewards       for all using (true) with check (true);
create policy "anon all" on ledger        for all using (true) with check (true);
create policy "anon all" on drills        for all using (true) with check (true);
create policy "anon all" on mock_exams    for all using (true) with check (true);
create policy "anon all" on messages      for all using (true) with check (true);
create policy "anon all" on badge_unlocks for all using (true) with check (true);
