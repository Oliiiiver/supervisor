-- 迁移:专项刷题分类加「图推」(图形推理)
-- 用法:Supabase SQL Editor 新建查询,粘贴运行一次
alter table drills drop constraint drills_module_check;
alter table drills add constraint drills_module_check
  check (module in ('zhengzhi', 'changshi', 'yanyu', 'shuliang', 'panduan', 'tutui', 'ziliao'));
