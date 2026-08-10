import { getUnreadNotificationCount } from "@/lib/account/queries";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/notifications/unread-count
 *
 * Exists so the navbar bell can show a badge without the navbar itself
 * knowing anything about the session.
 *
 * The navbar is a client component on every page, including the static
 * marketing ones. Reading the session during render would force all of them to
 * render dynamically and cost a database round trip per page view. Fetching
 * the count from the client after hydration keeps those pages cacheable and
 * confines the cost to signed-in users.
 *
 * Signed-out callers get a 200 with signedIn:false rather than a 401, because
 * this is a normal state for an anonymous visitor, not an error worth logging.
 */
export async function GET() {
  const empty = { signedIn: false, unreadCount: 0 };
  const headers = { "cache-control": "no-store" };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return Response.json(empty, { headers });

  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.json(empty, { headers });

  const unreadCount = await getUnreadNotificationCount();

  return Response.json({ signedIn: true, unreadCount }, { headers });
}
