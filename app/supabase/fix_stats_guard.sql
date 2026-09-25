-- 2026-09-26 v0.9.0: 「stats columns are RPC-only」保存エラーの恒久修正
-- 原因: oth_stats_guard トリガが security definer RPC 自身の正当な更新まで拒否していた。
-- 対応: RPC関数内で app.oth_rpc=on を設定し、guard はそれを許可する。ユーザーの直接 update は引き続き拒否。
create or replace function public.oth_guard_stats()
returns trigger language plpgsql as $$
begin
  if (new.xp is distinct from old.xp) or (new.level is distinct from old.level)
     or (new.wins is distinct from old.wins) or (new.losses is distinct from old.losses)
     or (new.draws is distinct from old.draws) or (new.streak is distinct from old.streak)
     or (new.best_streak is distinct from old.best_streak) then
    if current_setting('role', true) <> 'supabase_admin'
       and coalesce(current_setting('app.oth_rpc', true), '') <> 'on'
       and not (select coalesce(current_setting('request.jwt.claims', true), '') like '%"service_role"%') then
      raise exception 'stats columns are RPC-only';
    end if;
  end if;
  return new;
end;
$$;

-- othello_submit_game の先頭でフラグを立てる（本体は既存のまま関数丸ごと再作成）
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
  perform set_config('app.oth_rpc', 'on', true);   -- stats guard に RPC 経由だと通知
  if me is null then raise exception 'not logged in'; end if;
  if p_mode not in ('ai','online','local') then raise exception 'bad mode'; end if;
  if p_result not in ('win','lose','draw') then raise exception 'bad result'; end if;

  gain := 10 + p_moves
       + case when p_mode = 'ai' then 5 * coalesce(p_ai_level, 0)
              when p_mode = 'online' then 20 else 5 end
       + case when p_result = 'win' then 20 when p_result = 'draw' then 5 else 0 end;

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

  select pr.xp, pr.level, pr.wins, pr.losses, pr.draws, pr.streak, pr.best_streak
    into xp, lv, w, l, d, st, bs from oth_profiles pr where pr.id = me for update;
  if xp is null then
    insert into oth_profiles (id, display_name) values (me, '名無し')
      on conflict do nothing;
    xp := 0; lv := 1; w := 0; l := 0; d := 0; st := 0; bs := 0;
  end if;

  new_xp := xp + gain;
  new_lv := floor((-1 + sqrt(1 + new_xp / 25.0)) / 2);
  if new_lv < 1 then new_lv := 1; end if;
  if new_lv > 50 then new_lv := 50; new_xp := 63750; end if;

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
