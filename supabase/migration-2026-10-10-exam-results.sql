-- 模考记录改为按板块保存总题数、正确数,并区分限时完成与超时补做。
-- 原有百分比字段保留,用于展示历史记录;results 为空的记录仍按旧格式处理。
alter table mock_exams
  add column if not exists mode text not null default 'timed'
    check (mode in ('timed', 'overtime'));

alter table mock_exams
  add column if not exists results jsonb not null default '{}'::jsonb;
