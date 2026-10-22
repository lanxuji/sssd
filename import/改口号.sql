-- ============================================================
--  把球队口号改为「实达酒鬼，快乐足球」
--
--  适用：已经跑过之前的「修正球队名称.sql」，队名已经是狮山实达，
--       只想把口号从「狮山实达，实干致胜」改成新口号。
--
--  用法：Supabase → SQL Editor → New query → 粘贴 → Run
--  只改口号，不动队名、比赛、球员、场地任何数据
-- ============================================================

-- 先看一眼当前存的是什么
select id, name, slogan from public.team_profile;

-- 改口号（幂等：不管当前是旧口号还是新口号，跑完都是新口号）
update public.team_profile
set slogan = '实达酒鬼，快乐足球'
where id = '1';

-- 如果上面没生效（说明表里 id 不是 '1'），用这句兜底：改所有行
update public.team_profile
set slogan = '实达酒鬼，快乐足球'
where slogan is null or slogan <> '实达酒鬼，快乐足球';

-- 刷新缓存，让 App 立刻读到新值
notify pgrst, 'reload schema';

-- 确认改好了
select id, name, slogan from public.team_profile;
