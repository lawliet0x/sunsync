-- Public directory listings are not onboarded operational societies.
create table public.public_society_directory (
 slug text primary key check(slug ~ '^[a-z][a-z0-9_]{1,100}$'),
 name text not null check(length(name) between 2 and 200),
 address text not null check(length(address) between 5 and 1000),
 locality text not null, postal_code text not null check(postal_code ~ '^[0-9]{6}$'),
 source_url text not null check(source_url like 'https://%'), source_name text not null,
 notes text not null, city text not null check(city='Mira Bhayandar'),
 state text not null check(state='Maharashtra'), country text not null check(country='India'),
 verification_status text not null check(verification_status='public_listing_unverified'),
 accessed_on date not null, created_at timestamptz not null default now()
);
alter table public.public_society_directory enable row level security;
revoke all on public.public_society_directory from public,anon,authenticated;
grant select on public.public_society_directory to authenticated;
create policy directory_signed_in_read on public.public_society_directory for select to authenticated using(true);
comment on table public.public_society_directory is 'Public third-party society listings only. Not legal registration, consent, affiliation, onboarding, resident, energy or financial records. No operational society_id association.';
insert into public.public_society_directory (slug,name,address,locality,postal_code,source_url,source_name,notes,city,state,country,verification_status,accessed_on) values
('satellite_park','Satellite Park Co Operative Housing Society','84 Hatkesh, Mangal Nagar, Mira Bhayandar Rd, Shanti Vidya Nagari, Phase 3, Hatkesh Udhog Nagar, Mira Road East, 401107, India','Mira Road East','401107','https://exa.ai/library/place/9r73ddy3wc4','Exa Places directory','Address punctuation normalized. Public directory listing only; current registration and occupancy not independently verified.','Mira Bhayandar','Maharashtra','India','public_listing_unverified','2026-11-10'),
('akash_chhaya','Akash Chhaya Co-operative Housing Society','A-42&41, Sector 3, Shanti Nagar, Mira Road East, Mira Bhayandar, Maharashtra 401107, India','Shanti Nagar, Mira Road East','401107','https://exa.ai/library/place/c56rhh5lmdz','Exa Places directory','A-42&41 is the building-address label published by the directory, not a resident unit record. Registration not independently verified.','Mira Bhayandar','Maharashtra','India','public_listing_unverified','2026-11-10'),
('krishna_vatika','Krishna Vatika Co Operative Housing Society','8V28+XW2, Indralok Phase 3, Mira Road East, 401105, India','Indralok Phase 3, Mira Road East','401105','https://exa.ai/library/place/btmltn0mvht','Exa Places directory','Source supplies a plus code rather than a street/building number. Address and PIN retained as listed; not postal-address validation. Registration not independently verified.','Mira Bhayandar','Maharashtra','India','public_listing_unverified','2026-11-10'),
('satyam_heritage','Satyam Heritage Co-operative Housing Society','Jangid Estate Rd, Gaurav Galaxy, Mira Road East, Mira Bhayandar, Maharashtra 401107, India','Gaurav Galaxy, Mira Road East','401107','https://yappe.in/maharashtra/mira-bhayandar/satyam-heritage-co-operative-housing-society/2356113','Yappe place directory','Public directory listing only; current registration and occupancy not independently verified.','Mira Bhayandar','Maharashtra','India','public_listing_unverified','2026-11-10');
