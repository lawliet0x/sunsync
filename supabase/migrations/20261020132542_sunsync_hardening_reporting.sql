-- Referential identifiers and provenance become immutable once created.
revoke update on public.buildings,public.installations,public.community_challenges from authenticated;
grant update(name,address) on public.buildings to authenticated;
grant update(name,capacity_kwp) on public.installations to authenticated;
grant update(title,description,target_kwh,ends_at) on public.community_challenges to authenticated;
drop policy scoped_read on public.devices;
create policy device_read on public.devices for select to authenticated using(public.admin_of(society_id) or (kind='generation' and public.member_of(society_id)) or public.owns_membership(membership_id));
create function public.stamp_approval() returns trigger language plpgsql set search_path='' as $$ begin new.approved_by=auth.uid(); return new; end $$;
create trigger stamp_tariff before insert on public.tariffs for each row execute function public.stamp_approval();
create trigger stamp_factor before insert on public.emission_factors for each row execute function public.stamp_approval();
create function public.touch_updated() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create trigger touch_profile before update on public.profiles for each row execute function public.touch_updated();
create trigger touch_society before update on public.societies for each row execute function public.touch_updated();
create trigger touch_settings before update on public.platform_settings for each row execute function public.touch_updated();
create function public.energy_report(society uuid, start_at timestamptz,end_at timestamptz,grain text default 'day') returns table(bucket timestamptz,generation numeric,consumption numeric) language plpgsql stable security invoker set search_path='' as $$ begin if grain is null or grain not in ('day','week','month') or start_at is null or end_at is null or end_at<=start_at or end_at>start_at+interval '2 years' then raise exception 'Invalid report range'; end if; return query select date_trunc(grain,r.interval_start at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata',coalesce(sum(r.energy_kwh) filter(where d.kind='generation'),0),coalesce(sum(r.energy_kwh) filter(where d.kind='consumption'),0) from public.readings r join public.devices d on d.id=r.device_id where r.society_id=society and r.interval_start>=start_at and r.interval_start<end_at group by 1 order by 1; end $$;
-- All-time credit balance is sum of an append-only, nonnegative energy-attribution ledger.
create function public.credit_summary(society uuid) returns table(total_kwh numeric,total_estimated_savings_inr numeric,total_estimated_avoided_kg numeric) language sql stable security invoker set search_path='' as $$ select coalesce(sum(a.energy_kwh),0),case when count(*)=count(a.estimated_savings_inr) and count(*)>0 then sum(a.estimated_savings_inr) end,case when count(*)=count(a.estimated_avoided_kg) and count(*)>0 then sum(a.estimated_avoided_kg) end from public.allocations a where a.society_id=society $$;
revoke execute on function public.stamp_approval(),public.touch_updated(),public.energy_report(uuid,timestamptz,timestamptz,text),public.credit_summary(uuid) from public,anon;
grant execute on function public.energy_report(uuid,timestamptz,timestamptz,text),public.credit_summary(uuid) to authenticated;
-- Index every frequent RLS/filter FK, not just primary keys.
create index device_society on public.devices(society_id);
create index building_society on public.buildings(society_id);
create index installation_society on public.installations(society_id);
create index batch_society_time on public.allocation_batches(society_id,interval_start,interval_end);
create index credit_membership on public.credit_transactions(membership_id,created_at);
create index tariff_validity on public.tariffs(society_id,valid_from,valid_until);
create index factor_validity on public.emission_factors(society_id,valid_from,valid_until);
create index request_applicant on public.registration_requests(applicant_id,created_at);
create index membership_scope on public.memberships(society_id,active);
create index audit_actor on public.audit_logs(actor_id);
