-- ============================================================
-- NEON OTHELLO — DB 初期化 SQL（基本設計書 v1.0 §2 準拠）
-- 既存 Supabase プロジェクト（bpsjzmnbnwtvizxjpwec）に追加。
-- Dashboard → SQL Editor に貼り付けて 1 回実行。
-- ※ テトリスの既存テーブル（profiles/scores）には一切触れない。
-- ============================================================

-- 1) oth_profiles: 公開情報＋レベル＋カスタマイズ
create table if not exists public.oth_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '名無し' check (char_length(display_name) <= 20),
  avatar_url   text,
  xp           int  not null default 0,
  level        int  not null default 1,
  wins         int  not null default 0,
  losses       int  not null default 0,
  draws        int  not null default 0,
  streak       int  not null default 0,
  best_streak  int  not null default 0,
  icon_stones  boolean not null default false,
  stone_pref   jsonb  not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2) oth_games: 対局記録（投稿後不変）
create table if not exists public.oth_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.oth_profiles(id) on delete cascade,
  opp_user_id uuid references public.oth_profiles(id),
  mode text not null check (mode in ('ai','online','local')),
  ai_level int,
  result text not null check (result in ('win','lose','draw','abort')),
  black_count int not null default 0,
  white_count int not null default 0,
  moves int not null default 0,
  moves_svg text not null default '',
  moves_hash text not null default '',
  xp_gained int not null default 0,
  played_at timestamptz not null default now()
);
create unique index if not exists oth_games_dedup
  on public.oth_games (user_id, mode, moves_hash)
  where mode <> 'local';   -- 同一棋譜の二度投稿防止（AI/オンライン）

-- 3) oth_invites: 招待（相手だけが届出を操作できる）
create table if not exists public.oth_invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.oth_profiles(id) on delete cascade,
  to_user   uuid not null references public.oth_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  created_at timestamptz not null default now()
);

-- 4) oth_matches: 進行中対局のスナップショット（再接続用・終局後削除）
create table if not exists public.oth_matches (
  id uuid primary key default gen_random_uuid(),
  black uuid not null references public.oth_profiles(id) on delete cascade,
  white uuid not null references public.oth_profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','ended','abandoned')),
  moves text not null default '',
  updated_at timestamptz not null default now()
);

-- 5) oth_queue: マッチング待機（自分が自分の行だけ操作）
create table if not exists public.oth_queue (
  user_id uuid primary key references public.oth_profiles(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','playing')),
  updated_at timestamptz not null default now()
);

-- 6) インデックス
create index if not exists oth_games_user_idx  on public.oth_games (user_id, played_at desc);
create index if not exists oth_rank_xp_idx     on public.oth_profiles (xp desc, created_at asc);
create index if not exists oth_rank_wins_idx   on public.oth_profiles (wins desc, xp desc);
create index if not exists oth_invites_to_idx  on public.oth_invites (to_user, created_at desc);
create index if not exists oth_matches_user_idx on public.oth_matches (black, updated_at desc);
create index if not exists oth_matches_user2_idx on public.oth_matches (white, updated_at desc);

-- 7) RLS
alter table public.oth_profiles enable row level security;
alter table public.oth_games    enable row level security;
alter table public.oth_invites  enable row level security;
alter table public.oth_matches  enable row level security;
alter table public.oth_queue    enable row level security;

drop policy if exists oth_profiles_read    on public.oth_profiles;
create policy oth_profiles_read    on public.oth_profiles for select using (true);
drop policy if exists oth_profiles_write_own on public.oth_profiles;
create policy oth_profiles_write_own on public.oth_profiles
  for update using (auth.uid() = id);
drop policy if exists oth_profiles_insert_own on public.oth_profiles;
create policy oth_profiles_insert_own on public.oth_profiles
  for insert with check (auth.uid() = id);
-- ※ display_name 以外は RPC のみが更新（クライアント更新を列レベルで制限）

drop policy if exists oth_games_read     on public.oth_games;
create policy oth_games_read     on public.oth_games for select using (true);
drop policy if exists oth_games_none     on public.oth_games;
create policy oth_games_none     on public.oth_games for insert with check (false);
-- insert は RPC 経由のみ許可（後述 security definer 関数）

drop policy if exists oth_invites_participants on public.oth_invites;
create policy oth_invites_participants on public.oth_invites
  for select using (auth.uid() = from_user or auth.uid() = to_user);
drop policy if exists oth_invites_insert on public.oth_invites;
create policy oth_invites_insert on public.oth_invites
  for insert with check (auth.uid() = from_user and from_user <> to_user);
drop policy if exists oth_invites_update on public.oth_invites;
create policy oth_invites_update on public.oth_invites
  for update using (auth.uid() = to_user);

drop policy if exists oth_matches_participants on public.oth_matches;
create policy oth_matches_participants on public.oth_matches
  for select using (auth.uid() = black or auth.uid() = white);
drop policy if exists oth_matches_owner_ops on public.oth_matches;
create policy oth_matches_owner_ops on public.oth_matches
  for all using (auth.uid() = black or auth.uid() = white)
  with check (auth.uid() = black or auth.uid() = white);

drop policy if exists oth_queue_read_all on public.oth_queue;
create policy oth_queue_read_all on public.oth_queue for select using (true);
drop policy if exists oth_queue_own on public.oth_queue;
create policy oth_queue_own on public.oth_queue
  for insert with check (auth.uid() = user_id);
drop policy if exists oth_queue_own_u on public.oth_queue;
create policy oth_queue_own_u on public.oth_queue
  for update using (auth.uid() = user_id);
drop policy if exists oth_queue_own_d on public.oth_queue;
create policy oth_queue_own_d on public.oth_queue
  for delete using (auth.uid() = user_id);

-- 8) 新規ユーザー自動作成トリガ（Google名・アイコンを引き継ぎ）
create or replace function public.handle_new_othello_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.oth_profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', '名無し'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists oth_on_auth_user_created on auth.users;
create trigger oth_on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_othello_user();

-- 9) 表示名列のみクライアント更新可にするヘルパー
create or replace function public.oth_set_display_name(new_name text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.oth_profiles
     set display_name = left(new_name, 20), updated_at = now()
   where id = auth.uid();
end;
$$;
revoke execute on function public.oth_set_display_name(text) from anon;
grant execute on function public.oth_set_display_name(text) to authenticated;

-- oth_profiles の戦績列（xp等の直接 update を防ぐ）
create or replace function public.oth_guard_stats()
returns trigger language plpgsql as $$
begin
  if (new.xp is distinct from old.xp) or (new.level is distinct from old.level)
     or (new.wins is distinct from old.wins) or (new.losses is distinct from old.losses)
     or (new.draws is distinct from old.draws) or (new.streak is distinct from old.streak)
     or (new.best_streak is distinct from old.best_streak) then
    if current_setting('role', true) <> 'supabase_admin'
       and not (select coalesce(current_setting('request.jwt.claims', true), '') like '%"service_role"%') then
      raise exception 'stats columns are RPC-only';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists oth_stats_guard on public.oth_profiles;
create trigger oth_stats_guard before update on public.oth_profiles
  for each row execute function public.oth_guard_stats();

-- 10) RPC: 対局投稿（XP計算・戦績更新・履歴投稿を DB 内で完結）
--     戻り値: { xp_gained, new_level, leveled_to }（level_up 演出のトリガ）
create or replace function public.othello_submit_game(
  p_mode text, p_result text, p_ai_level int,
  p_black_count int, p_white_count int, p_moves int,
  p_moves_svg text, p_opp_user uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  xp int; new_xp int; lv int; new_lv int;
  gain int; w int; l int; d int; st int; bs int;
  uid_hash text; dup boolean;
begin
  if me is null then raise exception 'not logged in'; end if;
  if p_mode not in ('ai','online','local') then raise exception 'bad mode'; end if;
  if p_result not in ('win','lose','draw') then raise exception 'bad result'; end if;

  -- 経験値（設計書 §6）: 10 + 手数 + 種別ボーナス + 勝敗ボーナス
  gain := 10 + p_moves
       + case when p_mode = 'ai' then 5 * coalesce(p_ai_level, 0)
              when p_mode = 'online' then 20 else 5 end
       + case when p_result = 'win' then 20 when p_result = 'draw' then 5 else 0 end;

  -- 同一棋譜の二度投稿防止（local を除く）
  if p_mode <> 'local' then
    uid_hash := md5(coalesce(p_moves_svg, '') || '|' || coalesce(p_opp_user::text, ''));
    select exists(select 1 from oth_games
      where user_id = me and mode = p_mode and moves_hash = uid_hash) into dup;
    if dup then raise exception 'duplicate game'; end if;
  else
    uid_hash := '';
  end if;

  insert into oth_games (user_id, opp_user_id, mode, ai_level, result,
    black_count, white_count, moves, moves_svg, moves_hash, xp_gained)
  values (me, p_opp_user, p_mode, p_ai_level, p_result,
    p_black_count, p_white_count, p_moves, coalesce(p_moves_svg,''), uid_hash, gain);

  select p.xp, p.level, p.wins, p.losses, p.draws, p.streak, p.best_streak
    into xp, lv, w, l, d, st, bs from oth_profiles p where p.id = me for update;
  if xp is null then
    insert into oth_profiles (id, display_name) values (me, '名無し')
      on conflict do nothing;
    xp := 0; lv := 1; w := 0; l := 0; d := 0; st := 0; bs := 0;
  end if;

  new_xp := xp + gain;
  -- Lv曲線: 必要累計 = 50 * n(n+1)/2  →  new_lv = max n s.t. 50*n(n+1)/2 <= new_xp
  new_lv := floor((-1 + sqrt(1 + new_xp / 25.0)) / 2);
  if new_lv < 1 then new_lv := 1; end if;
  if new_lv > 50 then new_lv := 50; new_xp := 63750; end if; -- Lv50 打ち止め

  if p_result = 'win' then w := w + 1; st := st + 1; bs := greatest(bs, st);
  elsif p_result = 'lose' then l := l + 1; st := 0;
  else d := d + 1; end if;

  update oth_profiles
     set xp = new_xp, level = new_lv, wins = w, losses = l, draws = d,
         streak = st, best_streak = bs, updated_at = now()
   where id = me;

  return jsonb_build_object('xp_gained', gain, 'xp', new_xp,
    'new_level', new_lv, 'leveled_to',
    case when new_lv > lv then new_lv else null end);
end;
$$;
revoke execute on function public.othello_submit_game(text,text,int,int,int,int,text,uuid) from anon;
grant execute on function public.othello_submit_game(text,text,int,int,int,int,text,uuid) to authenticated;

-- 11) RPC: 進行中対局の開始/更新/終了（オンライン用・相方検証込み）
create or replace function public.oth_match_start(p_black uuid, p_white uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare mid uuid;
begin
  if auth.uid() is null then raise exception 'not logged in'; end if;
  if auth.uid() not in (p_black, p_white) then raise exception 'not a participant'; end if;
  insert into oth_matches (black, white) values (p_black, p_white)
  returning id into mid;
  update oth_queue set status = 'playing' where user_id in (p_black, p_white);
  return mid;
end;
$$;
create or replace function public.oth_match_update(p_match uuid, p_moves text, p_status text default 'active')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update oth_matches set moves = p_moves, status = p_status, updated_at = now()
   where id = p_match and (black = auth.uid() or white = auth.uid());
  if p_status <> 'active' then
    update oth_queue set status = 'waiting'
     where user_id = auth.uid() and status = 'playing'
       and not exists (select 1 from oth_matches m
         where m.status = 'active' and (m.black = oth_queue.user_id or m.white = oth_queue.user_id));
  end if;
end;
$$;
revoke execute on function public.oth_match_start(uuid,uuid) from anon;
revoke execute on function public.oth_match_update(uuid,text,text) from anon;
grant execute on function public.oth_match_start(uuid,uuid) to authenticated;
grant execute on function public.oth_match_update(uuid,text,text) to authenticated;

-- 12) Realtime（Postgres Changes: oth_invites / oth_matches）
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname='public' and tablename='oth_invites') then
    alter publication supabase_realtime add table oth_invites;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname='public' and tablename='oth_matches') then
    alter publication supabase_realtime add table oth_matches;
  end if;
end $$;

-- 13) Data API 明示公開（Free/新設定プロジェクト向け・冪等）
grant usage on schema public to anon, authenticated;
grant select on public.oth_profiles, public.oth_games, public.oth_queue to anon, authenticated;
grant select on public.oth_matches, public.oth_invites to authenticated;
grant insert, update, delete on public.oth_queue to authenticated;
grant insert, update on public.oth_invites to authenticated;
grant select, insert, update, delete on public.oth_matches to authenticated;
grant update on public.oth_profiles to authenticated;

-- 14) 7日以上前の終了対局を自動掃除（pg_cron 導入済みの場合のみ有効）
-- do $$ begin
--   if exists (select 1 from pg_extension where extname='pg_cron') then
--     perform cron.schedule('oth-match-cleanup', '17 4 * * *',
--       $$delete from public.oth_matches where status <> 'active' and updated_at < now() - interval '7 days'$$);
--   end if;
-- end $$;
