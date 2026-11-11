-- Preserve the exact removed assignment without copying unrelated personal data.
create function public.audit_role_removal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_logs(actor_id,society_id,action,entity_type,entity_id,details)
  values(auth.uid(),old.society_id,'DELETE','role_assignments',old.id::text,
    jsonb_build_object('user_id',old.user_id,'role',old.role,'society_id',old.society_id));
  return old;
end $$;
revoke execute on function public.audit_role_removal() from public,anon,authenticated;
create trigger audit_role_delete after delete on public.role_assignments
for each row execute function public.audit_role_removal();
