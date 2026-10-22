-- ============================================================
--  修正云端球队资料里的旧队名 / 旧口号
--
--  适用：刷新页面时仍闪现「狮城联合」「以狮之名，联合致胜」
--        （建库时 team_profile 写入过旧值，一直存在云端数据库里）
--
--  用法：Supabase → SQL Editor → New query → 粘贴 → Run
--  只改队名与口号，不动任何比赛 / 球员 / 场地数据
-- ============================================================

-- 先看一眼当前存的是什么
select id, name, slogan, founded, home_venue
from public.team_profile;

-- 把旧队名/旧口号改成狮山实达（只在匹配旧值时才改，不会误伤你已改好的内容）
update public.team_profile
set name   = '狮山实达足球俱乐部',
    slogan = '狮山实达，实干致胜'
where (name like '%狮城联合%' or slogan like '%联合致胜%');

-- 如果你想连简介、主场一起自定义，用下面这段（把值改成你想要的再跑）：
-- update public.team_profile
-- set name       = '狮山实达足球俱乐部',
--     slogan     = '狮山实达，实干致胜',
--     founded    = '2021',
--     home_venue = '佛山世纪莲体育中心',
--     intro      = '狮山实达足球俱乐部。'
-- where id = '1';

-- 刷新缓存，让 App 立刻读到新值
notify pgrst, 'reload schema';

-- 确认改好了
select id, name, slogan from public.team_profile;
