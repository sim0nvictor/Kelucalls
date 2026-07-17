import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Clock, Eye, Calendar, Share2, ArrowLeft, ArrowRight, Tag, TrendingUp } from "lucide-react";

import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/metrics";

function SectionHeader({ title, icon: Icon, color }: { title: string; icon?: typeof ArrowRight; color?: string }) {
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

type PageProps = {
  params: Promise<{ slug: string }>;
};

async function getArticle(slug: string) {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("articles")
    .select(`
      *,
      category:article_categories(id, name, slug, color),
      tags:article_tags_junction(
        tag:article_tags(id, name, slug)
      )
    `)
    .eq("slug", slug)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .single();

  if (error || !data) return null;
  return data;
}

async function getRelatedArticles(categoryId: string, excludeId: string, limit = 3) {
  const db = getSupabaseServer();
  const { data, error } = await db
    .from("articles")
    .select(`
      *,
      category:article_categories(id, name, slug, color)
    `)
    .eq("status", "published")
    .eq("category_id", categoryId)
    .neq("id", excludeId)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

async function getLatestArticles(limit = 4) {
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

function extractHeadings(content: string) {
  const headingRegex = /^#{1,3}\s+(.+)$/gm;
  const headings: Array<{ level: number; text: string; id: string }> = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const text = match[1];
    const level = match[0].indexOf("###") >= 0 ? 3 : match[0].indexOf("##") >= 0 ? 2 : 1;
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    headings.push({ level, text, id });
  }

  return headings;
}

function processContent(content: string): string {
  // Simple markdown processing
  let processed = content
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-slate-900 rounded-xl p-4 overflow-x-auto my-4"><code class="text-sm text-slate-300">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-slate-800 px-2 py-1 rounded text-cyan-300 text-sm">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em class="text-slate-300">$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-cyan-400 hover:text-cyan-300 underline">$1</a>')
    // Headings
    .replace(/^###\s+(.+)$/gm, '<h3 id="$1" class="text-xl font-semibold text-white mt-8 mb-4">$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2 id="$1" class="text-2xl font-semibold text-white mt-10 mb-4">$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1 id="$1" class="text-3xl font-semibold text-white mt-12 mb-6">$1</h1>')
    // Blockquotes
    .replace(/^>\s+(.+)$/gm, '<blockquote class="border-l-4 border-cyan-400 pl-4 my-4 text-slate-400 italic">$1</blockquote>')
    // Unordered lists
    .replace(/^-\s+(.+)$/gm, '<li class="text-slate-300 ml-4">$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="border-white/10 my-8" />')
    // Paragraphs
    .replace(/\n\n/g, '</p><p class="text-slate-300 leading-relaxed my-4">')
    // Line breaks
    .replace(/\n/g, '<br />');

  return `<p class="text-slate-300 leading-relaxed my-4">${processed}</p>`;
}

function TableOfContents({ headings }: { headings: Array<{ level: number; text: string; id: string }> }) {
  if (headings.length === 0) return null;

  return (
    <Card className="border-white/10 bg-white/5 sticky top-24">
      <CardContent className="p-4">
        <h4 className="text-sm font-semibold text-white mb-4">Table of Contents</h4>
        <nav className="space-y-1">
          {headings.map((heading, idx) => (
            <a
              key={idx}
              href={`#${heading.id}`}
              className={`block text-sm text-slate-400 hover:text-cyan-400 transition-colors ${
                heading.level === 1 ? "pl-0" : heading.level === 2 ? "pl-4" : "pl-8"
              }`}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      </CardContent>
    </Card>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    return {
      title: "Article Not Found | Kelucalls Insights",
    };
  }

  const seoTitle = article.seo_title || article.title;
  const metaDesc = article.meta_description || article.summary || `Read ${article.title} on Kelucalls Insights.`;

  return {
    title: `${seoTitle} | Kelucalls Insights`,
    description: metaDesc,
    openGraph: {
      title: seoTitle,
      description: metaDesc,
      type: "article",
      publishedTime: article.published_at,
      authors: [String(article.author)],
      images: article.open_graph_image_url ? [String(article.open_graph_image_url)] : [],
    },
    twitter: {
      card: article.twitter_card || "summary_large_image",
      title: seoTitle,
      description: metaDesc,
      images: article.open_graph_image_url ? [String(article.open_graph_image_url)] : [],
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    notFound();
  }

  // Record view
  try {
    const supabase = getSupabaseClient();
    await supabase.from("article_views").insert({
      article_id: article.id,
    });
  } catch (error) {
    console.error("Failed to record article view", error);
  }

  // Get related articles
  const relatedArticles = article.category_id
    ? await getRelatedArticles(String(article.category_id), String(article.id))
    : [];

  const latestArticles = await getLatestArticles();

  const category = article.category as Record<string, unknown> | null;
  const tags = (article.tags as Array<Record<string, unknown>>)
    ?.map((t) => t.tag)
    .filter(Boolean) ?? [];

  const publishedAt = article.published_at as string | null;
  const updatedAt = article.updated_at as string | null;
  const headings = extractHeadings(String(article.content));

  // Generate JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.summary || article.meta_description,
    image: article.featured_image_url,
    datePublished: publishedAt,
    dateModified: updatedAt,
    author: {
      "@type": "Person",
      name: article.author,
    },
    publisher: {
      "@type": "Organization",
      name: "Kelucalls",
      logo: {
        "@type": "ImageObject",
        url: "/logo.jpg",
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
          {category && (
            <>
              <span className="text-slate-600">/</span>
              <Link
                href={`/insights/category/${category.slug}`}
                className="text-slate-400 hover:text-white transition-colors"
                style={{ color: String(category.color ?? "#22d3ee") }}
              >
                {String(category.name)}
              </Link>
            </>
          )}
        </nav>

        <div className="grid gap-8 lg:grid-cols-4">
          {/* Main Content */}
          <article className="lg:col-span-3">
            {/* Header */}
            <header className="mb-8">
              {category && (
                <Link
                  href={`/insights/category/${category.slug}`}
                  className="inline-block mb-4"
                >
                  <Badge
                    className="border-0"
                    style={{
                      backgroundColor: String(category.color ?? "#22d3ee"),
                      color: "#000",
                    }}
                  >
                    {String(category.name)}
                  </Badge>
                </Link>
              )}

              <h1 className="text-4xl font-semibold text-white sm:text-5xl">
                {article.title}
              </h1>

              {article.summary && (
                <p className="mt-4 text-xl text-slate-400">{article.summary}</p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  {article.author_avatar_url ? (
                    <Image
                      src={String(article.author_avatar_url)}
                      alt={String(article.author)}
                      width={32}
                      height={32}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="size-8 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400" />
                  )}
                  <span className="font-medium text-white">{article.author}</span>
                </div>
                <span className="flex items-center gap-1">
                  <Calendar className="size-4" />
                  {publishedAt && new Date(publishedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-4" />
                  {Number(article.reading_time_minutes)} min read
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="size-4" />
                  {formatNumber(Number(article.view_count))} views
                </span>
              </div>
            </header>

            {/* Featured Image */}
            {article.featured_image_url && (
              <div className="relative mb-8 aspect-[16/9] overflow-hidden rounded-3xl">
                <Image
                  src={String(article.featured_image_url)}
                  alt={String(article.featured_image_alt || article.title)}
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div className="mb-8 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Link key={String((tag as Record<string, unknown>).id)} href={`/insights/tag/${String((tag as Record<string, unknown>).slug)}`}>
                    <Badge className="text-xs bg-white/10 border-white/20">
                      <Tag className="mr-1 size-3" />
                      {String((tag as Record<string, unknown>).name)}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}

            {/* Content */}
            <div
              className="prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: processContent(String(article.content)),
              }}
            />

            {/* Share */}
            <div className="mt-12 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <span className="text-sm font-medium text-white">Share:</span>
              <Button variant="ghost" size="sm">
                <Share2 className="size-4 mr-2" />
                Copy Link
              </Button>
            </div>
          </article>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Table of Contents */}
            {headings.length > 2 && <TableOfContents headings={headings} />}

            {/* Live Intelligence Widget (if linked to token/channel) */}
            {(article.linked_token_id || article.linked_channel_id) && (
              <Card className="border-cyan-400/20 bg-cyan-400/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="size-5 text-cyan-400" />
                    <h4 className="font-semibold text-white">Live Intelligence</h4>
                  </div>
                  <p className="text-sm text-slate-400">
                    This article is connected to live market data.
                  </p>
                  {article.linked_token_id && (
                    <Link
                      href={`/tokens/${article.linked_token_id}`}
                      className="mt-4 block"
                    >
                      <Button variant="secondary" size="sm" className="w-full">
                        View Token Data
                      </Button>
                    </Link>
                  )}
                  {article.linked_channel_id && (
                    <Link
                      href={`/channel/${article.linked_channel_id}`}
                      className="mt-2 block"
                    >
                      <Button variant="secondary" size="sm" className="w-full">
                        View Channel
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}
          </aside>
        </div>

        {/* Related Articles */}
        {relatedArticles.length > 0 && (
          <section className="mt-16">
            <SectionHeader title="Related Articles" icon={ArrowRight} color="#22d3ee" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {relatedArticles.map((related) => (
                <Link
                  key={related.id}
                  href={`/insights/${related.slug}`}
                  className="group"
                >
                  <Card className="border-white/10 bg-white/5 transition-all hover:border-cyan-400/30">
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-white group-hover:text-cyan-300 line-clamp-2">
                        {related.title}
                      </h3>
                      <p className="mt-2 text-sm text-slate-400 line-clamp-2">
                        {related.summary}
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="size-3" />
                        {Number(related.reading_time_minutes)} min
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Latest Articles */}
        {latestArticles.length > 0 && (
          <section className="mt-16">
            <SectionHeader title="Latest Insights" icon={Clock} color="#22d3ee" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {latestArticles
                .filter((a) => a.id !== article.id)
                .slice(0, 4)
                .map((latest) => (
                  <Link
                    key={latest.id}
                    href={`/insights/${latest.slug}`}
                    className="group"
                  >
                    <Card className="border-white/10 bg-white/5 transition-all hover:border-cyan-400/30 h-full">
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-white group-hover:text-cyan-300 line-clamp-2">
                          {latest.title}
                        </h3>
                        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="size-3" />
                          {Number(latest.reading_time_minutes)} min
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}