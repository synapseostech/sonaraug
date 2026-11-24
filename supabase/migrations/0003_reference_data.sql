-- =============================================================================
-- 0003 — Reference data (taxonomy, languages, Ugandan regions)
-- =============================================================================
-- This is real reference data, not sample content. It defines the vocabulary
-- every listing, filter and form depends on. Extending the district list is a
-- data task tracked in docs/product/reference-data.md.
-- =============================================================================

create table public.content_categories (
  id          text primary key,
  label       text not null,
  parent_id   text references public.content_categories (id) on delete restrict,
  applies_to  text not null check (applies_to in ('station', 'podcast', 'video', 'all')),
  sort_order  integer not null default 0,
  constraint content_categories_id_format check (id ~ '^[a-z0-9_]{2,40}$')
);

comment on table public.content_categories is
  'Controlled vocabulary for station/podcast/video categories. Managed by platform admins only.';

insert into public.content_categories (id, label, applies_to, sort_order) values
  ('news',            'News & Current Affairs', 'all',     10),
  ('music',           'Music',                  'all',     20),
  ('talk',            'Talk & Discussion',      'all',     30),
  ('religion',        'Faith & Religion',       'all',     40),
  ('sports',          'Sports',                 'all',     50),
  ('business',        'Business & Finance',     'all',     60),
  ('education',       'Education',              'all',     70),
  ('health',          'Health',                 'all',     80),
  ('entertainment',   'Entertainment & Comedy', 'all',     90),
  ('culture',         'Culture & Language',     'all',    100),
  ('agriculture',     'Agriculture',            'all',    110),
  ('technology',      'Technology',             'all',    120),
  ('community',       'Community & Local',      'all',    130),
  ('kids',            'Children & Family',      'all',    140);

create table public.languages (
  code        text primary key,
  name        text not null,
  native_name text,
  constraint languages_code_format check (code ~ '^[a-z]{2,3}(-[A-Z]{2})?$')
);

insert into public.languages (code, name, native_name) values
  ('en',    'English',   'English'),
  ('lg',    'Luganda',   'Luganda'),
  ('sw',    'Swahili',   'Kiswahili'),
  ('nyn',   'Runyankole','Runyankole'),
  ('teo',   'Ateso',     'Ateso'),
  ('ach',   'Acholi',    'Luo'),
  ('lgg',   'Lugbara',   'Lugbara'),
  ('myx',   'Madi',      'Madi'),
  ('xog',   'Lusoga',    'Lusoga'),
  ('rub',   'Rukiga',    'Rukiga');

create table public.regions (
  code         text primary key,
  name         text not null,
  country_code char(2) not null default 'UG',
  kind         text not null check (kind in ('region', 'district', 'city')),
  parent_code  text references public.regions (code) on delete restrict
);

comment on table public.regions is
  'Ugandan regions and the districts used for radio filtering. Curated subset; full district coverage tracked in docs/product/reference-data.md.';

insert into public.regions (code, name, kind) values
  ('central',  'Central Uganda',  'region'),
  ('eastern',  'Eastern Uganda',  'region'),
  ('northern', 'Northern Uganda', 'region'),
  ('western',  'Western Uganda',  'region');

insert into public.regions (code, name, kind, parent_code) values
  ('kampala',   'Kampala',    'city',     'central'),
  ('wakiso',    'Wakiso',     'district', 'central'),
  ('mukono',    'Mukono',     'district', 'central'),
  ('jinja',     'Jinja',      'district', 'eastern'),
  ('mbale',     'Mbale',      'district', 'eastern'),
  ('soroti',    'Soroti',     'district', 'eastern'),
  ('tororo',    'Tororo',     'district', 'eastern'),
  ('gulu',      'Gulu',       'district', 'northern'),
  ('lira',      'Lira',       'district', 'northern'),
  ('arua',      'Arua',       'district', 'northern'),
  ('kitgum',    'Kitgum',     'district', 'northern'),
  ('mbarara',   'Mbarara',    'district', 'western'),
  ('fort_portal','Fort Portal','district', 'western'),
  ('kasese',    'Kasese',     'district', 'western'),
  ('hoima',     'Hoima',      'district', 'western'),
  ('masaka',    'Masaka',     'district', 'central');
