import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_BASE_PATH,
  ADMIN_EXPIRES_COOKIE,
  ADMIN_REFRESH_COOKIE,
  ADMIN_SIGN_IN_PATH
} from "@/lib/admin/constants";
import {
  buildAdminSessionClearCookies,
  buildAdminSessionCookies,
  type AdminSessionLike
} from "@/lib/admin/session-cookies";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/server-env";

type AdminRole = "super_admin" | "admin" | "analyst" | "moderator";

export type AdminIdentity = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: AdminRole;
};

/**
 * Why these codes exist: sign in used to fail with a single generic Error, so
 * a wrong password, an account missing from admin_users, and a missing
 * environment variable all rendered the same "invalid credentials" message.
 * That made a misconfigured deploy indistinguishable from a typo. The code
 * lets the caller show something specific without leaking anything a stranger
 * could use to enumerate accounts.
 */
export type AdminAuthErrorCode =
  | "not_configured"
  | "invalid_credentials"
  | "not_admin"
  | "unknown";

export class AdminAuthError extends Error {
  readonly code: AdminAuthErrorCode;

  constructor(code: AdminAuthErrorCode, message: string) {
    super(message);
    this.name = "AdminAuthError";
    this.code = code;
  }
}

function getSupabaseConfig() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!url || !anonKey || !serviceRoleKey) {
    throw new AdminAuthError(
      "not_configured",
      "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return { url, anonKey, serviceRoleKey };
}

function createAuthClient() {
  const { url, anonKey } = getSupabaseConfig();

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function createServiceRoleClient() {
  const { url, serviceRoleKey } = getSupabaseConfig();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function buildUnauthorizedRedirect(nextPath?: string) {
  const fallback = nextPath?.startsWith(ADMIN_BASE_PATH) ? nextPath : ADMIN_BASE_PATH;
  return `${ADMIN_SIGN_IN_PATH}?next=${encodeURIComponent(fallback)}`;
}

/**
 * Cookie attributes are built by @/lib/admin/session-cookies so that this
 * module and middleware.ts cannot drift apart. Middleware refreshes the same
 * session onto a NextResponse and must write byte identical attributes.
 */
export async function setAdminSessionCookies(session: AdminSessionLike) {
  const cookieStore = await cookies();

  for (const write of buildAdminSessionCookies(session)) {
    cookieStore.set(write.name, write.value, write.options);
  }
}

export async function clearAdminSessionCookies() {
  const cookieStore = await cookies();

  for (const write of buildAdminSessionClearCookies()) {
    cookieStore.set(write.name, write.value, write.options);
  }
}

export async function getAdminSessionTokens() {
  const cookieStore = await cookies();

  return {
    accessToken: cookieStore.get(ADMIN_ACCESS_COOKIE)?.value ?? null,
    refreshToken: cookieStore.get(ADMIN_REFRESH_COOKIE)?.value ?? null,
    expiresAt: Number(cookieStore.get(ADMIN_EXPIRES_COOKIE)?.value ?? 0)
  };
}

export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const { accessToken } = await getAdminSessionTokens();
  if (!accessToken) {
    return null;
  }

  const authClient = createAuthClient();
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);

  if (authError || !authData.user) {
    return null;
  }

  const serviceClient = createServiceRoleClient();
  const { data: adminUser, error: adminError } = await serviceClient
    .from("admin_users")
    .select("user_id, email, full_name, role, is_active")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError || !adminUser) {
    return null;
  }

  return {
    id: String(adminUser.user_id),
    email: adminUser.email ? String(adminUser.email) : authData.user.email ?? null,
    fullName: adminUser.full_name ? String(adminUser.full_name) : null,
    role: String(adminUser.role) as AdminRole
  };
}

export async function requireAdminIdentity() {
  const identity = await getAdminIdentity();
  if (!identity) {
    const headerStore = await headers();
    const nextPath = headerStore.get("x-kelucalls-pathname") ?? ADMIN_BASE_PATH;
    redirect(buildUnauthorizedRedirect(nextPath));
  }

  return identity;
}

export async function signInAdminWithPassword(email: string, password: string) {
  const authClient = createAuthClient();
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    throw new AdminAuthError("invalid_credentials", "Invalid admin credentials.");
  }

  const serviceClient = createServiceRoleClient();
  const { data: adminUser, error: adminError } = await serviceClient
    .from("admin_users")
    .select("user_id, is_active")
    .eq("user_id", data.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError || !adminUser) {
    throw new AdminAuthError(
      "not_admin",
      "This account is not authorized for admin access."
    );
  }

  await serviceClient
    .from("admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("user_id", data.user.id);

  await setAdminSessionCookies(data.session);
}

export async function getAdminRequestMetadata() {
  const headerStore = await headers();

  return {
    pathname: headerStore.get("x-kelucalls-pathname") ?? ADMIN_BASE_PATH,
    forwardedFor: headerStore.get("x-forwarded-for") ?? "",
    userAgent: headerStore.get("user-agent") ?? "",
    referer: headerStore.get("referer") ?? ""
  };
}

export async function logAdminAudit(
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  payload: Record<string, unknown> = {}
) {
  const identity = await requireAdminIdentity();
  const metadata = await getAdminRequestMetadata();
  const serviceClient = createServiceRoleClient();

  await serviceClient.from("admin_audit_logs").insert({
    admin_user_id: identity.id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    summary,
    payload: {
      ...payload,
      pathname: metadata.pathname,
      userAgent: metadata.userAgent
    },
    ip_hash: metadata.forwardedFor || null
  });
}
