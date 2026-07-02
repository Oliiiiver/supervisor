-- 迁移:给任务/奖品/留言加"创建者"字段,防止监督员的日常操作误触发她的成就
-- (伦敦傍晚 = 北京凌晨,监督员排课表会误解锁「一日之际」等)
-- 用法:Supabase SQL Editor 里粘贴运行一次即可,已有数据默认记为她创建

alter table tasks    add column created_by text not null default 'her' check (created_by in ('her', 'sup'));
alter table rewards  add column created_by text not null default 'her' check (created_by in ('her', 'sup'));
alter table messages add column author     text not null default 'her' check (author in ('her', 'sup'));

-- 初始那条「休息半天」是监督员定的,归位
update rewards set created_by = 'sup' where title = '休息半天';
