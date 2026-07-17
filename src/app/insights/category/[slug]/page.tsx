import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Clock, Eye, ArrowLeft, BookOpen } from "lucide-react";

import { getSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

async function getCategory(slug: string) {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("article_categories")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;
  return data;
}

async function getArticlesByCategory(
  categoryId: string,
  limit = 12,
  offset = 0
) {
  const db = getSupabaseServer();
  const { data, error, count } = await db
    .from("articles")
    .select(
      `
      *,
      category:article_categories(id, name, slug, color)
    `,
      { count: "exact" }
    )
    .eq("status", "published")
    .eq("category_id", categoryId)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return { articles: [], total: 0 };
  return { articles: data ?? [], total: count ?? 0 };
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const category = await getCategory(slug);

  if (!category) {
    return { title: "Category Not Found | Kelucalls Insights" };
  }

  return {
    title: `${category.name} | Kelucalls Insights`,
    description: category.description || `Browse all ${category.name} articles on Kelucalls Insights.`,
  };
}

function ArticleCard({ article }: { article: ArticleWithRelations }) {
  const category = article.category as Record<string, unknown> | null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const publishedAt = article.published_at as string | null;

  return (
    <Link href={`/insights/${article.slug}`} className="group block">
      <Card className="overflow-hidden border-white/10 bg-white/5 transition-all hover:border-cyan-400/30 hover:shadow-[0_0_30px_rgba(34,211,238,0.1)] h-full">
        <div className="relative aspect-[16/10]">
          {article.featured_image_url ? (
            <Image
              src={String(article.featured_image_url)}
              alt={String(article.featured_image_alt || article.title)}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-cyan-500/10 to-emerald-500/10">
              <BookOpen className="size-12 text-slate-600" />
            </div>
          )}
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

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { page } = await searchParams;
  const category = await getCategory(slug);

  if (!category) {
    notFound();
  }

  const pageNum = parseInt(page || "1", 10);
  const limit = 12;
  const offset = (pageNum - 1) * limit;
  const { articles, total } = await getArticlesByCategory(category.id, limit, offset);
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-8 flex items-center gap-2 text-sm">
        <Link
          href="/insights"
          className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="size-4" />
          Insights
        </Link>
      </nav>

      {/* Category Header */}
      <header className="mb-12">
        <div
          className="mb-4 inline-flex size-12 items-center justify-center rounded-full"
          style={{ backgroundColor: category.color ?? "#22d3ee" }}
        >
          <BookOpen className="size-6 text-black" />
        </div>
        <h1 className="text-4xl font-semibold text-white sm:text-5xl">
          {category.name}
        </h1>
        {category.description && (
          <p className="mt-4 max-w-2xl text-lg text-slate-400">
            {category.description}
          </p>
        )}
        <p className="mt-4 text-sm text-slate-500">
          {total} article{total !== 1 ? "s" : ""}
        </p>
      </header>

      {/* Articles Grid */}
      {articles.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-12 flex justify-center gap-2">
              {pageNum > 1 && (
                <Link
                  href={`/insights/category/${slug}?page=${pageNum - 1}`}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-all hover:border-cyan-400/40"
                >
                  Previous
                </Link>
              )}
              <span className="px-4 py-2 text-sm text-slate-500">
                Page {pageNum} of {totalPages}
              </span>
              {pageNum < totalPages && (
                <Link
                  href={`/insights/category/${slug}?page=${pageNum + 1}`}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-all hover:border-cyan-400/40"
                >
                  Next
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="py-12 text-center">
          <BookOpen className="mx-auto mb-4 size-12 text-slate-600" />
          <p className="text-slate-400">No articles in this category yet.</p>
        </div>
      )}
    </div>
  );
}