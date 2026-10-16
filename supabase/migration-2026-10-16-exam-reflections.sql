-- 用申论刷题感悟替代新记录中的申论分数输入,保留历史分数字段。
alter table mock_exams
  add column if not exists shenlun_reflection text not null default '';
