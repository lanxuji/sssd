-- ============================================================
--  狮山实达数据统计 · 一键补齐表结构 + 刷新缓存
--
--  什么时候用：保存比赛 / 球员 / 场地失败，提示
--  "Could not find the 'xxx' column ... in the schema cache"
--
--  用法：Supabase → SQL Editor → New query → 粘贴全文 → Run
--  特点：已存在的列会自动跳过，不丢任何现有数据，可反复执行
-- ============================================================

-- ---------- 1) 补齐 matches（比赛）----------
alter table public.matches add column if not exists opponent    text;
alter table public.matches add column if not exists match_date  timestamptz;
alter table public.matches add column if not exists season      text;
alter table public.matches add column if not exists round       text;
alter table public.matches add column if not exists competition text;
alter table public.matches add column if not exists is_home     boolean default true;
alter table public.matches add column if not exists venue_id    uuid;
alter table public.matches add column if not exists our_score   int;
alter table public.matches add column if not exists opp_score   int;
alter table public.matches add column if not exists status      text default 'upcoming';
alter table public.matches add column if not exists remark      text;
alter table public.matches add column if not exists created_by  text;
alter table public.matches add column if not exists created_at  timestamptz default now();

-- ---------- 2) 补齐 events（进球 / 助攻 / 射门 / 牌）----------
alter table public.events add column if not exists match_id   uuid;
alter table public.events add column if not exists player_id  uuid;
alter table public.events add column if not exists type       text;
alter table public.events add column if not exists count      int default 1;
alter table public.events add column if not exists minute     int;
alter table public.events add column if not exists is_penalty boolean default false;
alter table public.events add column if not exists created_at timestamptz default now();

-- ---------- 3) 补齐 players（球员）----------
alter table public.players add column if not exists name       text;
alter table public.players add column if not exists number     int;
alter table public.players add column if not exists position   text;
alter table public.players add column if not exists phone      text;
alter table public.players add column if not exists avatar_url text;
alter table public.players add column if not exists joined_at  date;
alter table public.players add column if not exists active     boolean default true;
alter table public.players add column if not exists created_at timestamptz default now();

-- ---------- 4) 补齐 venues（场地）----------
alter table public.venues add column if not exists name      text;
alter table public.venues add column if not exists address   text;
alter table public.venues add column if not exists surface   text;
alter table public.venues add column if not exists price     numeric;
alter table public.venues add column if not exists contact   text;
alter table public.venues add column if not exists map_url   text;
alter table public.venues add column if not exists remark    text;
alter table public.venues add column if not exists created_at timestamptz default now();

-- ---------- 5) 补齐 team_profile（球队资料）----------
alter table public.team_profile add column if not exists name       text;
alter table public.team_profile add column if not exists slogan     text;
alter table public.team_profile add column if not exists founded    text;
alter table public.team_profile add column if not exists home_venue text;
alter table public.team_profile add column if not exists logo_url   text;
alter table public.team_profile add column if not exists intro      text;
alter table public.team_profile add column if not exists updated_at timestamptz default now();

-- ---------- 6) 权限与访问策略（缺了会导致写入被拒）----------
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;

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

-- ---------- 7) 确保有球队资料行 ----------
insert into public.team_profile (id, name, slogan, founded, home_venue, intro)
values ('1', '狮山实达足球俱乐部', '狮山实达，实干致胜', '2021', '佛山世纪莲体育中心', '狮山实达足球俱乐部。')
on conflict (id) do nothing;

-- ---------- 8) 刷新 PostgREST 缓存（关键！不跑这句可能仍报同样的错）----------
notify pgrst, 'reload schema';

-- ---------- 验证：跑完应看到 5 张表各自的列数 ----------
select table_name, count(*) as column_count
from information_schema.columns
where table_schema = 'public'
  and table_name in ('team_profile','players','venues','matches','events')
group by table_name
order by table_name;
