create function public.benefit_report(society uuid,start_at timestamptz,end_at timestamptz,grain text default 'day') returns table(bucket timestamptz,credited_kwh numeric,estimated_savings_inr numeric,estimated_avoided_kg numeric) language plpgsql stable security invoker set search_path='' as $$ begin
if grain is null or grain not in ('day','week','month') or start_at is null or end_at is null or end_at<=start_at or end_at>start_at+interval '2 years' then raise exception 'Invalid report range'; end if;
return query select date_trunc(grain,a.created_at at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata',sum(a.energy_kwh),case when count(*)=count(a.estimated_savings_inr) then sum(a.estimated_savings_inr) end,case when count(*)=count(a.estimated_avoided_kg) then sum(a.estimated_avoided_kg) end from public.allocations a where a.society_id=society and a.created_at>=start_at and a.created_at<end_at group by 1 order by 1;
end $$;
revoke execute on function public.benefit_report(uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.benefit_report(uuid,timestamptz,timestamptz,text) to authenticated;
-- No application role may create a function/table in the exposed schema.
revoke create on schema public from public,anon,authenticated;
