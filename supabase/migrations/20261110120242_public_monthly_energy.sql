-- Preserve native published intervals. No synthetic daily disaggregation.
alter table public.readings drop constraint readings_check;
alter table public.readings add constraint readings_check check(interval_end>interval_start and (interval_end<=interval_start+interval '1 day' or (verification='public_dataset' and source_metadata->>'granularity'='month' and interval_end<=interval_start+interval '32 days')));
alter table public.readings drop constraint readings_energy_kwh_check;
alter table public.readings add constraint readings_energy_kwh_check check(energy_kwh>=0 and (energy_kwh<=1000000 or (verification='public_dataset' and energy_kwh<=1000000000)));
