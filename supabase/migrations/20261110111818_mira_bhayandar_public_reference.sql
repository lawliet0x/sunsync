-- Public municipal reference only. No inserts into operational/identity tables.
create table public.public_reference_records (
 key text primary key check (key ~ '^[a-z][a-z0-9_]{1,100}$'),
 category text not null check (category in ('city','history','historical_locality')),
 label text not null check (length(label) between 1 and 160),
 value_text text not null check (length(value_text) between 1 and 1000),
 numeric_value numeric check (numeric_value >= 0),
 unit text,
 reference_period text not null,
 scope_note text not null,
 source_url text not null check (source_url like 'https://www.mbmc.gov.in/%'),
 source_title text not null,
 accessed_on date not null,
 created_at timestamptz not null default now()
);
alter table public.public_reference_records enable row level security;
revoke all on public.public_reference_records from public, anon, authenticated;
grant select on public.public_reference_records to authenticated;
create policy reference_authenticated_read on public.public_reference_records for select to authenticated using (true);
comment on table public.public_reference_records is 'Sourced public municipal reference, not household, meter, tariff, credit or billing data. Client read-only; updates require reviewed migration.';
insert into public.public_reference_records (key,category,label,value_text,numeric_value,unit,reference_period,scope_note,source_url,source_title,accessed_on) values
('city_area','city','Municipal area','79.40 sq. km','79.4','sq_km','As stated on municipal history page; effective date unspecified','Published jurisdiction reference, not a surveyed rooftop or service area.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10'),
('population_2011','city','Population (2011 Census)','809,378','809378','persons','2011 Census','Historical city-wide population. Not a 2026 estimate, resident roster or number of SunSync users.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10'),
('municipality_established','history','Municipality established','12 June 1985',null,null,'1985-06-12','Historical date reported by MBMC.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10'),
('corporation_established','history','Municipal corporation established','28 February 2002',null,null,'2002-02-28','Official establishment date as stated by MBMC. Conflicting earlier upgrade wording is not imported.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10'),
('historical_locality_bhayandar','historical_locality','Bhayandar','Original Gram Panchayat merged on 12 June 1985',null,null,'1985-06-12','Historical locality name only. Not a current ward boundary, postal-address validation, onboarded society or registered household.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10'),
('historical_locality_navghar','historical_locality','Navghar','Original Gram Panchayat merged on 12 June 1985',null,null,'1985-06-12','Historical locality name only. Not a current ward boundary, postal-address validation, onboarded society or registered household.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10'),
('historical_locality_mira','historical_locality','Mira','Original Gram Panchayat merged on 12 June 1985',null,null,'1985-06-12','Historical locality name only. Not a current ward boundary, postal-address validation, onboarded society or registered household.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10'),
('historical_locality_kashi','historical_locality','Kashi','Original Gram Panchayat merged on 12 June 1985',null,null,'1985-06-12','Historical locality name only. Not a current ward boundary, postal-address validation, onboarded society or registered household.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10'),
('historical_locality_ghodbunder','historical_locality','Ghodbunder','Original Gram Panchayat merged on 12 June 1985',null,null,'1985-06-12','Historical locality name only. Not a current ward boundary, postal-address validation, onboarded society or registered household.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10'),
('historical_locality_rai_murdhe','historical_locality','Rai-Murdhe','Gram Panchayat added on 23 January 1990',null,null,'1990-01-23','Historical locality name only. Not a current ward boundary, postal-address validation, onboarded society or registered household.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10'),
('historical_locality_dongri','historical_locality','Dongri','Gram Panchayat added on 23 January 1990',null,null,'1990-01-23','Historical locality name only. Not a current ward boundary, postal-address validation, onboarded society or registered household.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10'),
('historical_locality_uttan','historical_locality','Uttan','Gram Panchayat added on 23 January 1990',null,null,'1990-01-23','Historical locality name only. Not a current ward boundary, postal-address validation, onboarded society or registered household.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10'),
('historical_locality_versova','historical_locality','Versova','Gram Panchayat added on 23 January 1990',null,null,'1990-01-23','Historical locality name only. Not a current ward boundary, postal-address validation, onboarded society or registered household.','https://www.mbmc.gov.in/en/mbmc/town-secretary-new','Mira Bhayandar Municipal Corporation — Town Secretary / History','2026-11-10');
