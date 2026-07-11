-- 幸运机制:任务首次完成时抽签(20% 双倍,1% 十倍),倍数落库
-- 用法:supabase.com → SQL Editor → 运行本文件
alter table tasks add column multiplier int check (multiplier in (1, 2, 10));
-- null = 还没抽过(存量任务与未完成任务都是 null,首次勾选时才抽)
