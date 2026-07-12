-- 留言板回复功能:引用式回复(微信风格),回复的留言带 reply_to 指向原文
-- 用法:supabase.com → SQL Editor → 运行本文件
alter table messages add column reply_to bigint references messages (id) on delete set null;
-- on delete set null:原文被删后,回复保留、引用显示"原留言已删除"
