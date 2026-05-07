import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  getAdminPassword,
  getAdminSessionSecret,
  getAdminUsername
} from "@/lib/server-env";

const ADMIN_SESSION_COOKIE = "kelucalls_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function sign(value: string) {
  const secret = getAdminSessionSecret();

  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not configured.");
  }

  return createHmac("sha256", secret).update(value).digest("hex");
}

function encodeSession(username: string, expiresAt: number) {
  const payload = `${username}:${expiresAt}`;
  const signature = sign(payload);
  return Buffer.from(`${payload}:${signature}`, "utf8").toString("base64url");
}

function decodeSession(token: string) {
  const decoded = Buffer.from(token, "base64url").toString("utf8");
  const [username, expiresAtRaw, signature] = decoded.split(":");

  if (!username || !expiresAtRaw || !signature) {
    return null;
  }

  const payload = `${username}:${expiresAtRaw}`;
  const expected = sign(payload);
  const provided = Buffer.from(signature, "utf8");
  const actual = Buffer.from(expected, "utf8");

  if (provided.length !== actual.length || !timingSafeEqual(provided, actual)) {
    return null;
  }

  const expiresAt = Number(expiresAtRaw);

  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return null;
  }

  return { username, expiresAt };
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return false;
  }

  return Boolean(decodeSession(token));
}

export async function requireAdminSession() {
  const ok = await isAdminAuthenticated();

  if (!ok) {
    redirect("/login?next=/admin");
  }
}

export async function createAdminSessionCookie() {
  const cookieStore = await cookies();
  const token = encodeSession(getAdminUsername(), Date.now() + SESSION_TTL_MS);

  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + SESSION_TTL_MS)
  });
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export function validateAdminCredentials(username: string, password: string) {
  const configuredPassword = getAdminPassword();

  if (!configuredPassword) {
    throw new Error("ADMIN_LOGIN_PASSWORD is not configured.");
  }

  return username === getAdminUsername() && password === configuredPassword;
}
