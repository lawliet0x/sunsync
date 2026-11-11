-- Public source records live in existing tables, never in a new directory.
alter table public.societies add column record_origin text not null default 'operational' check(record_origin in ('operational','public_source'));
alter table public.societies add column public_key text unique;
alter table public.societies add column source_metadata jsonb not null default '{}';
alter table public.societies add constraint public_society_provenance check(record_origin <> 'public_source' or (public_key is not null and source_metadata ? 'source_url' and source_metadata ? 'entity_kind'));
alter table public.societies drop constraint societies_timezone_check;
alter table public.societies add constraint societies_timezone_check check(length(timezone) between 3 and 60);
alter table public.installations add column source_metadata jsonb not null default '{}';
alter table public.installations alter column capacity_kwp drop not null;
alter table public.installations alter column commissioned_on drop not null;
alter table public.devices add column source_metadata jsonb not null default '{}';
alter table public.readings add column source_metadata jsonb not null default '{}';
alter table public.readings alter column received_by drop not null;
alter table public.readings drop constraint readings_verification_check;
alter table public.readings add constraint readings_verification_check check(verification in ('operator_validated','device_signed','public_dataset'));
alter table public.readings add constraint public_reading_provenance check((verification='public_dataset' and source_metadata ? 'source_url') or (verification<>'public_dataset' and received_by is not null));
-- Public source rows cannot imply authorization/onboarding and cannot be changed through app roles.
create function public.guard_public_source() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid; origin text; begin
 if TG_TABLE_NAME='societies' then
   if TG_OP='INSERT' then origin=new.record_origin;
   elsif TG_OP='DELETE' then origin=old.record_origin;
   else origin=case when old.record_origin='public_source' or new.record_origin='public_source' then 'public_source' else 'operational' end; end if;
 else
   if TG_OP='DELETE' then sid=old.society_id; else sid=new.society_id; end if;
   select record_origin into origin from public.societies where id=sid;
   if TG_OP='UPDATE' and origin is distinct from 'public_source' then
     select record_origin into origin from public.societies where id=old.society_id;
   end if;
 end if;
 if (auth.uid() is not null or session_user in ('authenticated','anon') or current_setting('role',true) in ('authenticated','anon')) and origin='public_source' then raise exception 'Public source records are read-only and do not authorize society access'; end if;
 if TG_TABLE_NAME='installations' then if TG_OP<>'DELETE' and origin is distinct from 'public_source' and (new.capacity_kwp is null or new.commissioned_on is null) then raise exception 'Operational installations require capacity and commissioning date'; end if; end if;
 if TG_TABLE_NAME='readings' then if TG_OP<>'DELETE' and new.verification='public_dataset' and origin is distinct from 'public_source' then raise exception 'Public dataset must belong to its own source site'; end if; end if;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
revoke all on function public.guard_public_source() from public,anon,authenticated;
do $$ declare t text; begin foreach t in array array['societies','buildings','memberships','installations','devices','readings','role_assignments','tariffs','emission_factors','allocation_rules','allocation_batches','allocations','credit_transactions','subscriptions','community_challenges'] loop execute format('create trigger guard_public_source before insert or update or delete on public.%I for each row execute function public.guard_public_source()',t); end loop; end $$;
create policy sourced_society_read on public.societies for select to authenticated using(record_origin='public_source');
do $$ declare t text; begin foreach t in array array['installations','devices','readings'] loop execute format('create policy public_source_read on public.%I for select to authenticated using(exists(select 1 from public.societies s where s.id=society_id and s.record_origin=''public_source''))',t); end loop; end $$;
create or replace function public.energy_report(society uuid,start_at timestamptz,end_at timestamptz,grain text default 'day') returns table(bucket timestamptz,generation numeric,consumption numeric) language plpgsql stable security invoker set search_path='' as $$
declare tz text; sourced boolean; begin
 if grain is null or grain not in ('day','week','month') or start_at is null or end_at is null or end_at<=start_at or end_at>start_at+interval '2 years' then raise exception 'Invalid report range'; end if;
 select timezone,record_origin='public_source' into tz,sourced from public.societies where id=society; tz=coalesce(tz,'Asia/Kolkata');
 return query select date_trunc(grain,r.interval_start at time zone tz) at time zone tz,case when sourced then sum(r.energy_kwh) filter(where d.kind='generation') else coalesce(sum(r.energy_kwh) filter(where d.kind='generation'),0) end,case when sourced then sum(r.energy_kwh) filter(where d.kind='consumption') else coalesce(sum(r.energy_kwh) filter(where d.kind='consumption'),0) end from public.readings r join public.devices d on d.id=r.device_id where r.society_id=society and r.interval_start>=start_at and r.interval_start<end_at group by 1 order by 1;
end $$;
