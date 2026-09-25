-- ログイン後にプロフィールが作られない既存ユーザー向けの即席修正 (v2)
-- PostgreSQL の CREATE POLICY には IF NOT EXISTS がないため、存在確認をDOブロックで行う

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'oth_profiles'
      and policyname = 'oth_profiles_insert_own'
  ) then
    create policy oth_profiles_insert_own on public.oth_profiles
      for insert with check (auth.uid() = id);
  end if;
end;
$$;

insert into public.oth_profiles (id, display_name, avatar_url)
select u.id,
       coalesce(u.raw_user_meta_data->>'name', '名無し'),
       u.raw_user_meta_data->>'avatar_url'
from auth.users u
where not exists (select 1 from public.oth_profiles p where p.id = u.id)
on conflict (id) do nothing;
