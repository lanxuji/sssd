-- ============================================================
--  狮山实达数据统计 —— Supabase 建表脚本
--  用法：Supabase 控制台 → 左侧 SQL Editor → New query → 粘贴 → Run
--  执行顺序无所谓，可重复执行（已用 IF NOT EXISTS / DROP POLICY IF EXISTS）
-- ============================================================

-- 1) 球队资料（全表只保留 id='1' 这一条）
create table if not exists public.team_profile (
  id          text primary key,
  name        text,
  slogan      text,
  founded     text,
  home_venue  text,
  logo_url    text,
  intro       text,
  updated_at  timestamptz default now()
);

-- 2) 球员
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  number      int,
  position    text,
  phone       text,
  avatar_url  text,
  joined_at   date,
  active      boolean default true,
  created_at  timestamptz default now()
);

-- 3) 比赛场地
create table if not exists public.venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  surface     text,
  price       numeric,
  contact     text,
  map_url     text,
  remark      text,
  created_at  timestamptz default now()
);

-- 4) 赛程 / 比赛
create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  opponent    text,
  match_date  timestamptz,
  season      text,
  round       text,
  competition text,                       -- 联赛 / 杯赛 / 友谊赛 / 内部赛
  is_home     boolean default true,
  venue_id    uuid,
  our_score   int,
  opp_score   int,
  status      text default 'upcoming',   -- upcoming / finished / cancelled
  remark      text,
  created_by  text,                      -- 录入人账号（录入员只能删自己录的）
  created_at  timestamptz default now()
);

-- 老项目升级用：已建过表的执行这几句即可，不会丢数据
alter table public.matches add column if not exists competition text;
alter table public.matches add column if not exists created_by text;

-- 5) 比赛事件（进球 / 助攻）
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid,
  player_id   uuid,
  type        text,                       -- goal / assist / shoot / yellow / red
  count       int default 1,
  minute      int,
  is_penalty  boolean default false,      -- 是否点球（仅 goal 有效）
  created_at  timestamptz default now()
);

-- 老项目升级用
alter table public.events add column if not exists is_penalty boolean default false;

-- ============================================================
--  开启行级安全，并允许匿名 key 读写（App 通过管理密码控制修改权限）
-- ============================================================
alter table public.team_profile enable row level security;
alter table public.players      enable row level security;
alter table public.venues       enable row level security;
alter table public.matches      enable row level security;
alter table public.events       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['team_profile','players','venues','matches','events'] loop
    execute format('drop policy if exists sclh_anon_all on public.%I', t);
    execute format('drop policy if exists sclh_auth_all on public.%I', t);
    execute format('create policy sclh_anon_all on public.%I for all to anon using (true) with check (true)', t);
    execute format('create policy sclh_auth_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- 授权（新格式 publishable key 走的也是 anon 角色，同样生效）
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;

-- 初始化球队资料行（on conflict do nothing：已存在则保留，不会覆盖你改过的内容）
insert into public.team_profile (id, name, slogan, founded, home_venue, intro)
values ('1', '狮山实达足球俱乐部', '狮山实达，实干致胜', '2021', '佛山世纪莲体育中心',
        '狮山实达足球俱乐部。')
on conflict (id) do nothing;

-- ⚠️ 老项目升级：如果之前建库时写入过旧队名（狮城联合），跑下面这句纠正
-- update public.team_profile set name='狮山实达足球俱乐部', slogan='狮山实达，实干致胜'
--  where id='1' and (name like '%狮城联合%' or slogan like '%联合致胜%');
