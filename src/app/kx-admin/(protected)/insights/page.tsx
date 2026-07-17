import { Suspense } from "react";
import Link from "next/link";
import { Plus, Edit, Trash2, Eye, Calendar, Tag, FileText, TrendingUp, Star } from "lucide-react";

import { requireAdminIdentity } from "@/lib/admin/auth";
import { ADMIN_BASE_PATH } from "@/lib/admin/constants";
import {
  listArticles,
  listArticleCategories,
  listArticleTags,
  getInsightsStats
} from "@/lib/admin/data";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatusPill } from "@/components/admin/status-pill";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type PageProps = {
  searchParams: Promise<{
    saved?: string;
    created?: string;
    deleted?: string;
    error?: string;
    edit?: string;
    tab?: string;
    new?: string;
  }>;
};

async function ArticlesList({ status }: { status?: string }) {
  const { articles } = await listArticles({ status, limit: 50 });

  if (articles.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500">
        <FileText className="mx-auto mb-4 size-12 opacity-30" />
        <p>No articles found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {articles.map((article: Record<string, unknown>) => {
        const category = article.category as Record<string, unknown> | null;
        const title = typeof article.title === "string" ? article.title : "Untitled article";
        const summary = typeof article.summary === "string" ? article.summary : null;
        const isFeatured = Boolean(article.is_featured);
        const isTrending = Boolean(article.is_trending);
        const isEditorPick = Boolean(article.is_editor_pick);
        const publishedAt = typeof article.published_at === "string" ? article.published_at : null;
        const readingTime = typeof article.reading_time_minutes === "number" ? article.reading_time_minutes : Number(article.reading_time_minutes ?? 0);
        const viewCount = typeof article.view_count === "number" ? article.view_count : Number(article.view_count ?? 0);

        return (
          <Card key={String(article.id)} className="border-white/8 bg-slate-950/70">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {article.featured_image_url ? (
                    <div
                      className="size-16 shrink-0 rounded-xl bg-cover bg-center"
                      style={{ backgroundImage: `url(${article.featured_image_url})` }}
                    />
                  ) : (
                    <div className="size-16 shrink-0 rounded-xl bg-white/5" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white truncate">
                        {title}
                      </span>
                      <AdminStatusPill value={String(article.status)} />
                      {isFeatured && (
                        <Badge className="border-amber-400/20 bg-amber-400/10 text-amber-200 text-xs">
                          <Star className="mr-1 size-3" /> Featured
                        </Badge>
                      )}
                      {isTrending && (
                        <Badge className="border-cyan-400/20 bg-cyan-400/10 text-cyan-200 text-xs">
                          <TrendingUp className="mr-1 size-3" /> Trending
                        </Badge>
                      )}
                      {isEditorPick && (
                        <Badge className="border-purple-400/20 bg-purple-400/10 text-purple-200 text-xs">
                          <Star className="mr-1 size-3" /> Editor Pick
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      {category && (
                        <span
                          className="flex items-center gap-1"
                          style={{ color: String(category.color ?? "#22d3ee") }}
                        >
                          <Tag className="size-3" />
                          {String(category.name)}
                        </span>
                      )}
                      <span>{readingTime} min read</span>
                      <span>{viewCount} views</span>
                      {publishedAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {new Date(publishedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {summary && (
                      <p className="mt-2 text-sm text-slate-400 line-clamp-2">
                        {summary}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Link href={`/insights/${article.slug}`} target="_blank">
                    <Button variant="ghost" size="sm">
                      <Eye className="size-4" />
                    </Button>
                  </Link>
                  <Link href={`${ADMIN_BASE_PATH}/insights?edit=${article.id}`}>
                    <Button variant="secondary" size="sm">
                      <Edit className="size-4 mr-1" /> Edit
                    </Button>
                  </Link>
                  <form action={async () => {
                    "use server";
                    const { deleteArticleAction } = await import("@/app/kx-admin/actions");
                    const formData = new FormData();
                    formData.append("articleId", String(article.id));
                    await deleteArticleAction(formData);
                  }}>
                    <ConfirmDeleteButton
                      confirmMessage={`Are you sure you want to delete "${article.title}"?`}
                    />
                  </form>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

async function CategoriesList() {
  const categories = await listArticleCategories();

  if (categories.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500">
        <Tag className="mx-auto mb-4 size-12 opacity-30" />
        <p>No categories found.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((cat) => (
        <Card key={cat.id} className="border-white/8 bg-slate-950/70">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div
                className="size-4 rounded-full"
                style={{ backgroundColor: cat.color ?? "#22d3ee" }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate">{cat.name}</div>
                <div className="text-xs text-slate-500">/{cat.slug}</div>
              </div>
              <Badge variant="secondary" className="text-xs">
                {cat.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            {cat.description && (
              <p className="mt-2 text-sm text-slate-400 line-clamp-2">{cat.description}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function TagsList() {
  const tags = await listArticleTags();

  if (tags.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500">
        <Tag className="mx-auto mb-4 size-12 opacity-30" />
        <p>No tags found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Badge key={tag.id} variant="secondary" className="text-sm">
          {tag.name}
        </Badge>
      ))}
    </div>
  );
}

async function StatsCards() {
  const stats = await getInsightsStats();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="border-white/8 bg-slate-950/70">
        <CardContent className="p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Articles</div>
          <div className="mt-1 text-2xl font-semibold text-white">{stats.totalArticles}</div>
        </CardContent>
      </Card>
      <Card className="border-white/8 bg-slate-950/70">
        <CardContent className="p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Published</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-400">{stats.publishedArticles}</div>
        </CardContent>
      </Card>
      <Card className="border-white/8 bg-slate-950/70">
        <CardContent className="p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Drafts</div>
          <div className="mt-1 text-2xl font-semibold text-amber-400">{stats.draftArticles}</div>
        </CardContent>
      </Card>
      <Card className="border-white/8 bg-slate-950/70">
        <CardContent className="p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Views</div>
          <div className="mt-1 text-2xl font-semibold text-cyan-400">{stats.totalViews}</div>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AdminInsightsPage({ searchParams }: PageProps) {
  await requireAdminIdentity();
  const params = await searchParams;
  const editingId = params.edit ?? null;
  const activeTab = params.tab ?? "articles";

  const categories = await listArticleCategories();
  const tags = await listArticleTags();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        badge="Content Management"
        title="Insights"
        description="Manage articles, categories, and tags for the Kelucalls Insights section."
        aside={
          <Link href={`${ADMIN_BASE_PATH}/insights?new=1`}>
            <Button>
              <Plus className="size-4 mr-2" /> New Article
            </Button>
          </Link>
        }
      />

      {(params.saved || params.created || params.deleted) && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          {params.saved && "Article saved successfully."}
          {params.created && "Article created successfully."}
          {params.deleted && "Article deleted successfully."}
        </div>
      )}
      {params.error && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          Something went wrong. Please try again.
        </div>
      )}

      <Suspense fallback={<div>Loading stats...</div>}>
        <StatsCards />
      </Suspense>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        <Link
          href={`${ADMIN_BASE_PATH}/insights?tab=articles`}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "articles"
              ? "border-b-2 border-cyan-400 text-cyan-300"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Articles
        </Link>
        <Link
          href={`${ADMIN_BASE_PATH}/insights?tab=categories`}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "categories"
              ? "border-b-2 border-cyan-400 text-cyan-300"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Categories
        </Link>
        <Link
          href={`${ADMIN_BASE_PATH}/insights?tab=tags`}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "tags"
              ? "border-b-2 border-cyan-400 text-cyan-300"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Tags
        </Link>
      </div>

      {/* Article Editor Modal */}
      {params.new === "1" && (
        <Card className="border-white/10 bg-slate-950/90">
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold text-white mb-6">Create New Article</h2>
            <ArticleEditorForm categories={categories} tags={tags} />
          </CardContent>
        </Card>
      )}

      {editingId && (
        <Card className="border-white/10 bg-slate-950/90">
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold text-white mb-6">Edit Article</h2>
            <ArticleEditorForm
              categories={categories}
              tags={tags}
              articleId={editingId}
            />
          </CardContent>
        </Card>
      )}

      {/* Tab Content */}
      {activeTab === "articles" && (
        <Suspense fallback={<div>Loading articles...</div>}>
          <ArticlesList />
        </Suspense>
      )}

      {activeTab === "categories" && (
        <>
          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-4">
              <form action={async () => {
                "use server";
                const { createArticleCategoryAction } = await import("@/app/kx-admin/actions");
                const formData = new FormData();
                formData.append("name", "New Category");
                formData.append("slug", "new-category");
                await createArticleCategoryAction(formData);
              }}>
                <Button type="submit" variant="secondary" size="sm">
                  <Plus className="size-4 mr-2" /> Add Category
                </Button>
              </form>
            </CardContent>
          </Card>
          <Suspense fallback={<div>Loading categories...</div>}>
            <CategoriesList />
          </Suspense>
        </>
      )}

      {activeTab === "tags" && (
        <>
          <Card className="border-white/8 bg-slate-950/70">
            <CardContent className="p-4">
              <form action={async () => {
                "use server";
                const { createArticleTagAction } = await import("@/app/kx-admin/actions");
                const formData = new FormData();
                formData.append("name", "New Tag");
                formData.append("slug", "new-tag");
                await createArticleTagAction(formData);
              }}>
                <Button type="submit" variant="secondary" size="sm">
                  <Plus className="size-4 mr-2" /> Add Tag
                </Button>
              </form>
            </CardContent>
          </Card>
          <Suspense fallback={<div>Loading tags...</div>}>
            <TagsList />
          </Suspense>
        </>
      )}
    </div>
  );
}

function ArticleEditorForm({
  categories,
  tags,
  articleId
}: {
  categories: Array<{ id: string; name: string; slug: string }>;
  tags: Array<{ id: string; name: string; slug: string }>;
  articleId?: string;
}) {
  const action = articleId ? "updateArticleAction" : "createArticleAction";
  const actionImport = articleId
    ? `const { updateArticleAction } = await import("@/app/kx-admin/actions");`
    : `const { createArticleAction } = await import("@/app/kx-admin/actions");`;

  return (
    <form
      action={async (formData: FormData) => {
        "use server";
        if (articleId) {
          formData.append("articleId", articleId);
          const { updateArticleAction } = await import("@/app/kx-admin/actions");
          await updateArticleAction(formData);
        } else {
          const { createArticleAction } = await import("@/app/kx-admin/actions");
          await createArticleAction(formData);
        }
      }}
      className="space-y-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Title
          </label>
          <input
            name="title"
            required
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
            placeholder="Article title"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Slug
          </label>
          <input
            name="slug"
            required
            pattern="[a-z0-9-]+"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
            placeholder="article-slug"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Summary
        </label>
        <textarea
          name="summary"
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
          placeholder="Brief summary of the article..."
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Content (Markdown supported)
        </label>
        <textarea
          name="content"
          required
          rows={15}
          className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50 font-mono text-sm"
          placeholder="# Write your article here...&#10;&#10;Supports **markdown** formatting."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Featured Image URL
          </label>
          <input
            name="featuredImageUrl"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
            placeholder="https://..."
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Author
          </label>
          <input
            name="author"
            defaultValue="Kelucalls Team"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Category
          </label>
          <select
            name="categoryId"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
          >
            <option value="">Select category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Status
          </label>
          <select
            name="status"
            defaultValue="draft"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Reading Time (min)
          </label>
          <input
            name="readingTimeMinutes"
            type="number"
            defaultValue="5"
            min="1"
            max="120"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Publish Date
          </label>
          <input
            name="publishedAt"
            type="datetime-local"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Schedule Date
          </label>
          <input
            name="scheduledAt"
            type="datetime-local"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Tags
          </label>
          <select
            name="tagIds"
            multiple
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50 h-24"
          >
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <h3 className="font-medium text-white">Badges</h3>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" name="isFeatured" value="true" className="rounded" />
            Featured
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" name="isTrending" value="true" className="rounded" />
            Trending
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" name="isEditorPick" value="true" className="rounded" />
            Editor Pick
          </label>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <h3 className="font-medium text-white">SEO</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
              SEO Title
            </label>
            <input
              name="seoTitle"
              maxLength={70}
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
              placeholder="Custom SEO title"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Keywords
            </label>
            <input
              name="keywords"
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
              placeholder="keyword1, keyword2, keyword3"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Meta Description
          </label>
          <textarea
            name="metaDescription"
            maxLength={160}
            rows={2}
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
            placeholder="SEO meta description"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit">
          {articleId ? "Save Changes" : "Create Article"}
        </Button>
        <Link href={`${ADMIN_BASE_PATH}/insights`}>
          <Button type="button" variant="secondary">Cancel</Button>
        </Link>
      </div>
    </form>
  );
}