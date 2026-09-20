create schema if not exists readon_private;
revoke all on schema readon_private from public;
grant usage on schema readon_private to anon, authenticated;
create function readon_private.vault_hash() returns text language sql stable security invoker set search_path = '' as $$
  select case when token ~ '^[0-9a-f]{64}$'
  then pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token,'UTF8')),'hex') else null end
  from (select nullif(current_setting('request.headers',true),'')::jsonb ->> 'x-readon-vault' as token) h;
$$;
revoke all on function readon_private.vault_hash() from public;
grant execute on function readon_private.vault_hash() to anon, authenticated;
create table public.readon_notes (
  id uuid primary key,
  vault_hash text not null default readon_private.vault_hash() check(vault_hash ~ '^[0-9a-f]{64}$'),
  ciphertext text not null check(length(ciphertext) between 24 and 600000 and ciphertext ~ '^[A-Za-z0-9+/]+={0,2}$'),
  iv text not null check(iv ~ '^[A-Za-z0-9+/]{16}$'),
  version smallint not null default 1 check(version=1),
  created_at timestamptz not null default now()
);
create index readon_notes_vault_created on public.readon_notes(vault_hash,created_at desc);
alter table public.readon_notes enable row level security;
revoke all on public.readon_notes from public, anon, authenticated;
grant select, insert, delete on public.readon_notes to anon, authenticated;
create policy own_notes_read on public.readon_notes for select to anon,authenticated
 using(vault_hash = (select readon_private.vault_hash()));
create policy own_notes_insert on public.readon_notes for insert to anon,authenticated
 with check(vault_hash = (select readon_private.vault_hash()));
create policy own_notes_delete on public.readon_notes for delete to anon,authenticated
 using(vault_hash = (select readon_private.vault_hash()));
comment on table public.readon_notes is 'Client-encrypted lecture notes. Device bearer token is hashed by RLS; decryption key never leaves browser.';

create table readon_private.storage_budget (
 singleton boolean primary key default true check(singleton),
 used_bytes bigint not null default 0 check(used_bytes>=0),
 minute_start timestamptz not null default date_trunc('minute',now()),
 minute_writes integer not null default 0
);
insert into readon_private.storage_budget(singleton) values(true);
alter table readon_private.storage_budget enable row level security;
revoke all on readon_private.storage_budget from public,anon,authenticated;
create function readon_private.enforce_note_budget() returns trigger
language plpgsql security definer set search_path='' as $$
declare caller_hash text := readon_private.vault_hash(); affected integer; size_bytes bigint;
begin
 if current_setting('role',true) in ('anon','authenticated') then
  if auth.uid() is null and caller_hash is null then raise exception 'missing vault authorization'; end if;
  if caller_hash is null or caller_hash is distinct from (case when TG_OP='INSERT' then NEW.vault_hash else OLD.vault_hash end) then raise exception 'invalid vault authorization'; end if;
 end if;
 if TG_OP='INSERT' then
  size_bytes := octet_length(NEW.ciphertext)+512;
  update readon_private.storage_budget
    set used_bytes=used_bytes+size_bytes,
        minute_writes=case when minute_start=date_trunc('minute',now()) then minute_writes+1 else 1 end,
        minute_start=date_trunc('minute',now())
    where singleton and used_bytes+size_bytes<=104857600
      and (minute_start<>date_trunc('minute',now()) or minute_writes<60);
  get diagnostics affected=ROW_COUNT;
  if affected=0 then raise exception 'storage capacity or write rate reached'; end if;
  if (select count(*) from public.readon_notes where vault_hash=NEW.vault_hash)>=30 then raise exception 'vault note limit reached'; end if;
  return NEW;
 else
  update readon_private.storage_budget set used_bytes=greatest(0,used_bytes-octet_length(OLD.ciphertext)-512) where singleton;
  return OLD;
 end if;
end $$;
revoke all on function readon_private.enforce_note_budget() from public,anon,authenticated;
create trigger readon_note_budget before insert or delete on public.readon_notes
for each row execute function readon_private.enforce_note_budget();

create policy no_direct_budget_access on readon_private.storage_budget for all to anon,authenticated using(false) with check(false);
