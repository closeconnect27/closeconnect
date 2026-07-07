-- Multi-city support, mirroring extra_categories (0001_init.sql): a
-- listing keeps one primary city (existing `city` column, still used for
-- the at-a-glance display and as the default in edit forms) plus an
-- optional set of additional cities it should also surface under when
-- browsing/filtering -- same relationship as category/extra_categories.
alter table communities add column extra_cities text[] not null default '{}';
alter table events add column extra_cities text[] not null default '{}';
