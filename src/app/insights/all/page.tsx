import Link from "next/link";
import Image from "next/image";
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
  searchParams: Promise<{ page?: string }>;
};

async function getAllArticles(limit = 12, offset = 0) {
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
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return { articles: [] as ArticleWithRelations[], total: 0 };
  return { articles: (data ?? []) as ArticleWithRelations[], total: count ?? 0 };
}

export const metadata = {
  title: "All Insights | Kelucalls Insights",
  description: "Browse the full archive of Kelucalls insights articles.",
};

function ArticleCard({ article }: { article: ArticleWithRelations }) {
  const category = article.category as Record<string, unknown> | null;

  return (
    <Link href={`/insights/${article.slug}`} className="group block">
      <Card className="h-full overflow-hidden border-white/10 bg-white/5 transition-all hover:border-cyan-400/30 hover:shadow-[0_0_30px_rgba(34,211,238,0.1)]">
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
          <h3 className="line-clamp-2 text-lg font-semibold text-white transition-colors group-hover:text-cyan-300">
            {article.title}
          </h3>
          {article.summary && (
            <p className="mt-2 line-clamp-2 text-sm text-slate-400">{article.summary}</p>
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

export default async function AllInsightsPage({ searchParams }: PageProps) {
  const { page } = await searchParams;
  const pageNum = parseInt(page || "1", 10);
  const limit = 12;
  const offset = (pageNum - 1) * limit;
  const { articles, total } = await getAllArticles(limit, offset);
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-8 flex items-center gap-2 text-sm">
        <Link
          href="/insights"
          className="flex items-center gap-1 text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Insights
        </Link>
      </nav>

      <header className="mb-12">
        <h1 className="text-4xl font-semibold text-white sm:text-5xl">All Insights</h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-400">
          Browse every published insight article from Kelucalls.
        </p>
        <p className="mt-4 text-sm text-slate-500">
          {total} article{total !== 1 ? "s" : ""}
        </p>
      </header>

      {articles.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-12 flex justify-center gap-2">
              {pageNum > 1 && (
                <Link
                  href={`/insights/all?page=${pageNum - 1}`}
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
                  href={`/insights/all?page=${pageNum + 1}`}
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
          <p className="text-slate-400">No published insights are available yet.</p>
        </div>
      )}
    </div>
  );
}
