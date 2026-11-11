-- CSV imports are all-or-nothing and use the existing audited operator ingestion.
create function public.import_meter_readings(society uuid, records jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; device_id uuid; reading_id uuid; ids jsonb := '[]'::jsonb; row_number integer := 0;
begin
  if society is null or not public.admin_of(society) then raise exception 'Forbidden'; end if;
  if records is null or jsonb_typeof(records) <> 'array' then raise exception 'Expected a readings array'; end if;
  if jsonb_array_length(records) < 1 or jsonb_array_length(records) > 20 or octet_length(records::text) > 14000 then
    raise exception 'Import requires 1-20 rows and at most 14000 JSON bytes';
  end if;
  -- One society lock before processing prevents reversed device-order deadlocks.
  perform pg_advisory_xact_lock(hashtextextended(society::text,0));
  for item in select value from jsonb_array_elements(records) loop
    row_number := row_number + 1;
    begin
      if jsonb_typeof(item) <> 'object' then raise exception 'Expected a row object'; end if;
      if (select count(*) from jsonb_object_keys(item)) <> 6 or not (item ?& array['device_serial','start_at','end_at','kwh','source','external_id']) then
        raise exception 'Expected exactly the six CSV fields';
      end if;
      if exists (select 1 from jsonb_each(item) e where jsonb_typeof(e.value) <> 'string') then raise exception 'CSV fields must be text'; end if;
      if length(trim(item->>'device_serial')) not between 1 and 160
        or length(trim(item->>'source')) not between 10 and 2000
        or length(trim(item->>'external_id')) not between 1 and 200 then raise exception 'Invalid serial, source or record ID length'; end if;
      if (item->>'start_at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$'
        or (item->>'end_at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$'
        or (item->>'kwh') !~ '^\d{1,7}(\.\d{1,6})?$' then raise exception 'Use timezone-qualified ISO timestamps and decimal interval kWh'; end if;
      select id into device_id from public.devices where society_id=society and serial=trim(item->>'device_serial') and active;
      if not found then raise exception 'Active meter not found in the selected society'; end if;
      reading_id := public.ingest_reading(device_id,(item->>'start_at')::timestamptz,(item->>'end_at')::timestamptz,(item->>'kwh')::numeric,trim(item->>'source'),trim(item->>'external_id'));
      ids := ids || jsonb_build_array(reading_id);
    exception
      when raise_exception then raise exception 'CSV row % rejected: %',row_number,SQLERRM;
      when others then raise exception 'CSV row % rejected: invalid values, duplicate source ID, or database constraint',row_number;
    end;
  end loop;
  return jsonb_build_object('accepted',row_number,'reading_ids',ids);
end $$;
revoke all on function public.import_meter_readings(uuid,jsonb) from public,anon;
grant execute on function public.import_meter_readings(uuid,jsonb) to authenticated;
