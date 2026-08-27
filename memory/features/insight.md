## Insights (articles/blog/CMS)

**What it is:** `/insights` — editorial content: market intelligence, research reports, token/KOL analysis, platform updates.

**How it works:** A fairly standard CMS layer — `articles` (with SEO fields, categories, tags, optional links to a specific `token_id`/`channel_id`, editorial flags like featured/trending/editor-pick), only publicly visible once `status = 'published'` and `published_at` has passed. Anonymous page views are logged to `article_views` for admin-side analytics; nothing about this feature feeds back into ranking or scoring.

