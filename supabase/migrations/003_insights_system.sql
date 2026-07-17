begin;

-- ============================================================================
-- Insights System - Kelucalls Crypto Intelligence Platform
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
drop type if exists public.article_status;
create type public.article_status as enum ('draft', 'published', 'scheduled', 'archived');

-- ----------------------------------------------------------------------------
-- Article Categories
-- ----------------------------------------------------------------------------
create table public.article_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  description text,
  color text default '#22d3ee',
  icon text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger article_categories_set_updated_at
before update on public.article_categories
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Article Tags
-- ----------------------------------------------------------------------------
create table public.article_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- Articles
-- ----------------------------------------------------------------------------
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug citext not null unique,
  summary text,
  content text not null default '',
  featured_image_url text,
  featured_image_alt text,
  author text not null default 'Kelucalls Team',
  author_avatar_url text,
  category_id uuid references public.article_categories(id) on delete set null,
  status public.article_status not null default 'draft',
  published_at timestamptz,
  scheduled_at timestamptz,
  is_featured boolean not null default false,
  is_trending boolean not null default false,
  is_editor_pick boolean not null default false,
  reading_time_minutes integer not null default 5,
  view_count integer not null default 0,
  share_count integer not null default 0,

  -- SEO fields
  seo_title text,
  meta_description text,
  canonical_url text,
  keywords text[],
  open_graph_image_url text,
  twitter_card text default 'summary_large_image',

  -- Related articles
  related_article_ids uuid[] default '{}',

  -- Live intelligence links
  linked_token_id uuid references public.tokens(id) on delete set null,
  linked_channel_id uuid references public.channels(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger articles_set_updated_at
before update on public.articles
for each row execute function public.set_updated_at();

create index articles_slug_idx on public.articles (slug);
create index articles_status_idx on public.articles (status, published_at desc);
create index articles_category_idx on public.articles (category_id, published_at desc);
create index articles_featured_idx on public.articles (is_featured, published_at desc) where is_featured = true;
create index articles_trending_idx on public.articles (is_trending, published_at desc) where is_trending = true;
create index articles_editor_pick_idx on public.articles (is_editor_pick, published_at desc) where is_editor_pick = true;

-- ----------------------------------------------------------------------------
-- Article Tags Junction Table
-- ----------------------------------------------------------------------------
create table public.article_tags_junction (
  article_id uuid references public.articles(id) on delete cascade,
  tag_id uuid references public.article_tags(id) on delete cascade,
  primary key (article_id, tag_id)
);

create index article_tags_junction_article_idx on public.article_tags_junction (article_id);
create index article_tags_junction_tag_idx on public.article_tags_junction (tag_id);

-- ----------------------------------------------------------------------------
-- Article Views (Analytics)
-- ----------------------------------------------------------------------------
create table public.article_views (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) on delete cascade,
  session_id text,
  ip_hash text,
  referrer text,
  user_agent text,
  viewed_at timestamptz not null default timezone('utc', now())
);

create index article_views_article_idx on public.article_views (article_id, viewed_at desc);
create index article_views_date_idx on public.article_views (viewed_at desc);

-- ----------------------------------------------------------------------------
-- Row-level security
-- ----------------------------------------------------------------------------
alter table public.article_categories enable row level security;
alter table public.article_tags enable row level security;
alter table public.articles enable row level security;
alter table public.article_tags_junction enable row level security;
alter table public.article_views enable row level security;

-- Article categories: public read, admin write
create policy article_categories_public_read
  on public.article_categories
  for select
  to anon, authenticated
  using (is_active = true);

create policy article_categories_admin_write
  on public.article_categories
  for all
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
    )
  );

-- Article tags: public read, admin write
create policy article_tags_public_read
  on public.article_tags
  for select
  to anon, authenticated;

create policy article_tags_admin_write
  on public.article_tags
  for all
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
    )
  );

-- Articles: public read for published, admin write
create policy articles_public_read
  on public.articles
  for select
  to anon, authenticated
  using (
    status = 'published'
    and (published_at is null or published_at <= timezone('utc', now()))
  );

create policy articles_admin_write
  on public.articles
  for all
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
    )
  );

-- Article tags junction: public read, admin write
create policy article_tags_junction_public_read
  on public.article_tags_junction
  for select
  to anon, authenticated;

create policy article_tags_junction_admin_write
  on public.article_tags_junction
  for all
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
    )
  );

-- Article views: admin only
create policy article_views_admin_read
  on public.article_views
  for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.is_active = true
    )
  );

create policy article_views_admin_insert
  on public.article_views
  for insert
  to anon, authenticated
  with check (true);

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant select on public.article_categories to anon, authenticated;
grant select on public.article_tags to anon, authenticated;
grant select on public.articles to anon, authenticated;
grant select on public.article_tags_junction to anon, authenticated;
grant select on public.article_views to authenticated;
grant insert on public.article_views to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Default categories
-- ----------------------------------------------------------------------------
insert into public.article_categories (name, slug, description, color, sort_order) values
  ('Market Intelligence', 'market-intelligence', 'Real-time market analysis and trends', '#22d3ee', 1),
  ('Research Reports', 'research-reports', 'Deep-dive research and analysis', '#10b981', 2),
  ('Token Analysis', 'token-analysis', 'Individual token deep dives', '#f59e0b', 3),
  ('KOL Analysis', 'kol-analysis', 'Key opinion leader performance', '#8b5cf6', 4),
  ('Telegram Intelligence', 'telegram-intelligence', 'Channel and signal analysis', '#ec4899', 5),
  ('Learn Crypto', 'learn-crypto', 'Educational content for traders', '#06b6d4', 6),
  ('Weekly Reports', 'weekly-reports', 'Weekly roundups and summaries', '#14b8a6', 7),
  ('Platform Updates', 'platform-updates', 'Kelucalls news and updates', '#f97316', 8)
on conflict (slug) do nothing;

commit;