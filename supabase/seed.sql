-- =============================================================================
-- LOCAL DEVELOPMENT SEED (supabase db reset). Never run against the hosted project.
-- Development placeholder plans: prices are NOT approved (price_is_placeholder).
-- =============================================================================
insert into public.subscription_plans (id, audience, code, name, description, interval, amount, currency, is_active, features, price_is_placeholder, sort_order)
values
  ('0b5e1f0a-0000-4000-8000-000000000001', 'listener', 'listener-monthly', 'Listener — monthly', 'All premium Medical Chronicles episodes.', 'monthly', 10000, 'UGX', true,
   '["Every premium Medical Chronicles episode","Listening history across devices","Cancel any time"]', true, 10),
  ('0b5e1f0a-0000-4000-8000-000000000002', 'listener', 'listener-annual', 'Listener — annual', 'A year of premium listening.', 'annual', 100000, 'UGX', true,
   '["Everything in monthly","One payment a year"]', true, 20)
on conflict (id) do nothing;

insert into public.subscription_plans (id, audience, code, name, description, interval, amount, currency, is_active, features, creator_limits, price_is_placeholder, sort_order)
values
  ('0b5e1f0a-0000-4000-8000-000000000003', 'creator', 'creator-starter', 'Creator — starter', 'Publish one show on Sonara after your application is approved.', 'monthly', 30000, 'UGX', true,
   '["1 show","Up to 50 episodes","Basic analytics"]',
   '{"maxShows":1,"maxEpisodes":50,"uploadAllowanceMb":2000,"storageMb":10000,"canPublish":true,"analytics":"basic","promotion":false,"supportLevel":"standard"}', true, 30)
on conflict (id) do nothing;
