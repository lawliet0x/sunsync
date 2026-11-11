alter table public.profiles add column community_alias text not null default '' check(length(community_alias)<=40);
alter table public.profiles add column leaderboard_opt_in boolean not null default false;
grant update(community_alias,leaderboard_opt_in) on public.profiles to authenticated;
create function public.manage_access(society uuid,target_user uuid,action text) returns void language plpgsql security definer set search_path='' as $$ begin
if action in ('grant_society_admin','revoke_society_admin','suspend_society','activate_society') then if not public.is_system() then raise exception 'Forbidden'; end if;
elsif action in ('deactivate_resident','activate_resident') then if not public.admin_of(society) then raise exception 'Forbidden'; end if;
else raise exception 'Invalid action'; end if;
perform public.limit_operation('access',20); perform 1 from public.societies where id=society for update; if not found then raise exception 'Society not found'; end if;
if action='grant_society_admin' then insert into public.role_assignments(user_id,role,society_id) values(target_user,'society',society) on conflict do nothing;
elsif action='revoke_society_admin' then delete from public.role_assignments where user_id=target_user and role='society' and society_id=society;
elsif action='suspend_society' then update public.societies set status='suspended' where id=society;
elsif action='activate_society' then update public.societies set status='active' where id=society;
elsif action='deactivate_resident' then update public.memberships set active=false where user_id=target_user and society_id=society;
elsif action='activate_resident' then
if not exists(select 1 from public.subscriptions s join public.plans p on p.id=s.plan_id where s.society_id=society and s.status='active' and p.active and s.starts_at<=now() and (s.ends_at is null or s.ends_at>now()) and p.max_residents>(select count(*) from public.memberships where society_id=society and active)) then raise exception 'Active subscription and spare resident capacity required'; end if;
update public.memberships set active=true where user_id=target_user and society_id=society;
end if;
insert into public.audit_logs(actor_id,society_id,action,entity_type,entity_id) values(auth.uid(),society,action,'access',target_user::text);
end $$;
-- Includes only explicitly opted-in aliases, never names, UUIDs, or non-participating households.
create function public.community_leaderboard(society uuid) returns table(alias text,credited_kwh numeric) language plpgsql stable security definer set search_path='' as $$ begin
if not(public.member_of(society) or public.admin_of(society)) then raise exception 'Forbidden'; end if;
return query select p.community_alias,sum(c.amount_kwh) from public.profiles p join public.memberships m on m.user_id=p.id join public.credit_transactions c on c.membership_id=m.id where m.society_id=society and m.active and p.leaderboard_opt_in and length(trim(p.community_alias))>0 group by p.id,p.community_alias order by sum(c.amount_kwh) desc limit 50;
end $$;
create function public.community_progress(society uuid) returns numeric language plpgsql stable security definer set search_path='' as $$ declare total numeric; begin if not(public.member_of(society) or public.admin_of(society)) then raise exception 'Forbidden'; end if; select coalesce(sum(amount_kwh),0) into total from public.credit_transactions where society_id=society; return total; end $$;
revoke execute on function public.manage_access(uuid,uuid,text),public.community_leaderboard(uuid),public.community_progress(uuid) from public,anon;
grant execute on function public.manage_access(uuid,uuid,text),public.community_leaderboard(uuid),public.community_progress(uuid) to authenticated;
-- A suspended society must not leave resident access to old private records active.
create or replace function public.owns_membership(m uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.memberships x join public.societies s on s.id=x.society_id where x.id=m and x.user_id=auth.uid() and x.active and s.status='active') $$;
