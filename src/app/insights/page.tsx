import Link from "next/link";
import { Clock, Eye, ArrowRight, TrendingUp, Star, BookOpen, Calendar } from "lucide-react";

import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArticleBanner } from "@/components/insights/article-banner";
import { formatNumber } from "@/lib/metrics";

type ArticleWithRelations = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  author: string;
  author_avatar_url: string | null;
  category_id: string | null;
  status: string;
  published_at: string | null;
  scheduled_at: string | null;
  is_featured: boolean;
  is_trending: boolean;
  is_editor_pick: boolean;
  reading_time_minutes: number;
  view_count: number;
  share_count: number;
  seo_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  keywords: string[] | null;
  open_graph_image_url: string | null;
  twitter_card: string | null;
  related_article_ids: string[] | null;
  linked_token_id: string | null;
  linked_channel_id: string | null;
  created_at: string;
  updated_at: string;
  category: { id: string; name: string; slug: string; color: string } | null;
};

function SectionHeader({ title, icon: Icon, color }: { title: string; icon?: typeof Star; color?: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      {Icon && (
        <div className="flex size-8 items-center justify-center rounded-lg" style={{ backgroundColor: color ? `${color}20` : 'rgba(34,211,238,0.2)' }}>
          <Icon className="size-4" style={{ color: color || '#22d3ee' }} />
        </div>
      )}
      <h2 className="text-xl font-semibold text-white">{title}</h2>
    </div>
  );
}

async function getFeaturedArticle() {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("articles")
    .select(`
      *,
      category:article_categories(id, name, slug, color)
    `)
    .eq("status", "published")
    .eq("is_featured", true)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

async function getLatestArticles(limit = 6) {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("articles")
    .select(`
      *,
      category:article_categories(id, name, slug, color)
    `)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

async function getTrendingArticles(limit = 4) {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("articles")
    .select(`
      *,
      category:article_categories(id, name, slug, color)
    `)
    .eq("status", "published")
    .eq("is_trending", true)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

async function getEditorPicks(limit = 3) {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("articles")
    .select(`
      *,
      category:article_categories(id, name, slug, color)
    `)
    .eq("status", "published")
    .eq("is_editor_pick", true)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

async function getCategories() {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("article_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) return [];
  return data ?? [];
}

export const metadata = {
  title: "Insights | Kelucalls - Crypto Intelligence",
  description:
    "Expert crypto research, market intelligence, and analysis from the Kelucalls team.",
};

function ArticleCard({
  article,
  featured = false,
}: {
  article: ArticleWithRelations;
  featured?: boolean;
}) {
  const category = article.category;
  const publishedAt = article.published_at;

  if (featured) {
    return (
      <Link href={`/insights/${article.slug}`} className="group block">
        <Card className="overflow-hidden border-white/10 bg-white/5 transition-all duration-300 hover:border-cyan-400/30 hover:shadow-[0_0_40px_rgba(34,211,238,0.1)]">
          <div className="grid gap-0 lg:grid-cols-2">
            <div className="relative aspect-[16/9] overflow-hidden lg:aspect-auto lg:min-h-[400px]">
              <ArticleBanner
                src={article.featured_image_url}
                alt={article.featured_image_alt || article.title}
                className="transition-transform duration-500 group-hover:scale-105"
                iconClassName="size-16"
              />
              {category && (
                <Badge
                  className="absolute left-4 top-4 border-0"
                  style={{
                    backgroundColor: String(category.color ?? "#22d3ee"),
                    color: "#000",
                  }}
                >
                  {String(category.name)}
                </Badge>
              )}
            </div>
            <CardContent className="flex flex-col justify-center p-8">
              <h2 className="text-3xl font-semibold text-white transition-colors group-hover:text-cyan-300">
                {article.title}
              </h2>
              {article.summary && (
                <p className="mt-4 text-lg text-slate-400 line-clamp-3">
                  {article.summary}
                </p>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="size-4" />
                  {Number(article.reading_time_minutes)} min read
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="size-4" />
                  {formatNumber(Number(article.view_count))} views
                </span>
                {publishedAt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-4" />
                    {new Date(publishedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </CardContent>
          </div>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={`/insights/${article.slug}`} className="group block">
      <Card className="overflow-hidden border-white/10 bg-white/5 transition-all duration-300 hover:border-cyan-400/30 hover:shadow-[0_0_30px_rgba(34,211,238,0.1)] h-full">
        <div className="relative aspect-[16/10] overflow-hidden">
          <ArticleBanner
            src={article.featured_image_url}
            alt={article.featured_image_alt || article.title}
            className="transition-transform duration-500 group-hover:scale-105"
          />
          {category && (
            <Badge
              className="absolute left-3 top-3 border-0 text-xs"
              style={{
                backgroundColor: String(category.color ?? "#22d3ee"),
                color: "#000",
              }}
            >
              {String(category.name)}
            </Badge>
          )}
        </div>
        <CardContent className="p-5">
          <h3 className="text-lg font-semibold text-white transition-colors group-hover:text-cyan-300 line-clamp-2">
            {article.title}
          </h3>
          {article.summary && (
            <p className="mt-2 text-sm text-slate-400 line-clamp-2">
              {article.summary}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {Number(article.reading_time_minutes)} min
            </span>
            <span className="flex items-center gap-1">
              <Eye className="size-3" />
              {formatNumber(Number(article.view_count))}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

type CategoryItem = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  color?: string | null;
};

function CategoryCard({ category }: { category: CategoryItem }) {
  return (
    <Link
      href={`/insights/category/${category.slug}`}
      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:border-cyan-400/30"
    >
      <div
        className="size-10 shrink-0 rounded-full"
        style={{ backgroundColor: category.color ?? "#22d3ee" }}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white truncate group-hover:text-cyan-300">
          {category.name}
        </div>
        {category.description && (
          <div className="text-xs text-slate-500 truncate">{category.description}</div>
        )}
      </div>
      <ArrowRight className="size-4 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-cyan-400" />
    </Link>
  );
}

export default async function InsightsPage() {
  const [featuredArticle, latestArticles, trendingArticles, editorPicks, categories] =
    await Promise.all([
      getFeaturedArticle(),
      getLatestArticles(),
      getTrendingArticles(),
      getEditorPicks(),
      getCategories(),
    ]);

  if (!featuredArticle && latestArticles.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <BookOpen className="mx-auto mb-4 size-16 text-slate-600" />
          <h1 className="text-2xl font-semibold text-white">Insights Coming Soon</h1>
          <p className="mt-2 text-slate-400">
            We are building high-quality crypto intelligence content for you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="size-6 text-cyan-400" />
          <span className="text-sm font-medium uppercase tracking-wider text-cyan-400">
            Kelucalls Insights
          </span>
        </div>
        <h1 className="text-4xl font-semibold text-white sm:text-5xl">
          Crypto Intelligence
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-400">
          Expert research, market analysis, and trading intelligence to help you
          stay ahead of the market.
        </p>
      </section>

      {/* Featured Article */}
      {featuredArticle && (
        <section className="mb-12">
          <SectionHeader title="Featured Story" icon={Star} color="#f59e0b" />
          <ArticleCard article={featuredArticle} featured />
        </section>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <section className="mb-12">
          <SectionHeader title="Explore Topics" icon={BookOpen} color="#22d3ee" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categories.slice(0, 8).map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
          </div>
        </section>
      )}

      {/* Trending Articles */}
      {trendingArticles.length > 0 && (
        <section className="mb-12">
          <SectionHeader title="Trending Now" icon={TrendingUp} color="#22d3ee" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trendingArticles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}

      {/* Editor's Picks */}
      {editorPicks.length > 0 && (
        <section className="mb-12">
          <SectionHeader title="Editor's Picks" icon={Star} color="#a855f7" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {editorPicks.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}

      {/* Latest Articles */}
      {latestArticles.length > 0 && (
        <section className="mb-12">
          <SectionHeader title="Latest Articles" icon={Clock} color="#10b981" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {latestArticles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
          {latestArticles.length >= 6 && (
            <div className="mt-8 text-center">
              <Link href="/insights/all">
                <button className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white transition-all hover:border-cyan-400/40 hover:bg-white/10">
                  View All Articles
                </button>
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
