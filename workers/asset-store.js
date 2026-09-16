/**
 * Shared asset storage helper (server/worker side only).
 *
 * Downloads an external image and uploads it to the public Supabase Storage
 * `assets` bucket, returning a STABLE public URL to be saved in the database
 * (channels.avatar_url / tokens.logo_url). This is what removes the site's
 * dependency on temporary/hotlinked external image URLs.
 *
 * Deterministic object paths — one object per entity, so re-runs REPLACE the
 * same object (upsert) instead of creating a new one on every refresh:
 *   channels/{channel_id}.{ext}
 *   tokens/{chain}/{contract_address}.{ext}
 *
 * The returned public URL carries a short content-hash `?v=` cache-buster so a
 * CHANGED image is picked up by CDNs / the Next.js image optimizer while the
 * underlying object path stays stable, and an UNCHANGED image yields the SAME
 * URL (letting callers skip a redundant DB write).
 *
 * Security: `sourceUrl` is used only at runtime to fetch bytes. It is never
 * persisted and must never be logged (Telegram getFile URLs embed the bot
 * token). Only the resulting Storage URL is persisted.
 *
 * No transcoding is performed (kept dependency-free — no `sharp`). Original
 * bytes are stored with their detected content-type; Next.js optimizes images
 * at serve time.
 */

import axios from "axios";
import { createHash } from "node:crypto";

export const ASSET_BUCKET = "assets";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB — avatars/logos are far smaller
const MAX_RETRIES = 3;

const EXT_BY_CONTENT_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

/** True if `url` points at an object in our public Storage assets bucket. */
export function isStableAssetUrl(url) {
  return (
    typeof url === "string" &&
    url.includes(`/storage/v1/object/public/${ASSET_BUCKET}/`)
  );
}

/** Normalize a raw Content-Type header to a bare lowercased mime (jpg -> jpeg). */
export function normalizeImageContentType(raw) {
  const ct = String(raw ?? "").split(";")[0].trim().toLowerCase();
  if (!ct) return null;
  if (ct === "image/jpg") return "image/jpeg";
  return ct;
}

export function extForContentType(contentType, fallback = "jpg") {
  return EXT_BY_CONTENT_TYPE[contentType] ?? fallback;
}

/** Lowercase/trim a contract address for a deterministic storage path. */
export function normalizeContractForPath(contractAddress) {
  return String(contractAddress ?? "").trim().toLowerCase();
}

function isRetryableError(error) {
  const status = error?.response?.status;
  return !status || status === 408 || status === 429 || status >= 500;
}

async function withRetries(operation) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES || !isRetryableError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }

  throw lastError;
}

/**
 * Download an image's bytes.
 * @returns {Promise<{ bytes: Buffer, contentType: string|null }>}
 * @throws on network error, non-2xx, oversize, empty body, or a non-image
 *         content-type (so an error/HTML page is never stored as an image).
 */
export async function downloadImage(sourceUrl, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES } = options;

  const res = await axios.get(sourceUrl, {
    responseType: "arraybuffer",
    timeout: timeoutMs,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    validateStatus: (status) => status >= 200 && status < 300,
  });

  const contentType = normalizeImageContentType(res.headers?.["content-type"]);
  if (contentType && !contentType.startsWith("image/")) {
    throw new Error(`unexpected content-type "${contentType}"`);
  }

  const bytes = Buffer.from(res.data);
  if (bytes.length === 0) throw new Error("empty image body");

  return { bytes, contentType };
}

/**
 * Upload bytes to the assets bucket at `path` (REPLACING any existing object)
 * and return the clean public URL (no query string).
 */
export async function storeImageAsset(supabase, { path, bytes, contentType }) {
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, bytes, {
    contentType: contentType || "application/octet-stream",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("failed to resolve public URL");
  return data.publicUrl;
}

/**
 * Download an external image and store it under a deterministic path, returning
 * a stable public URL with a content-hash cache-buster.
 *
 * @param {object} supabase          service-role Supabase client
 * @param {object} opts
 * @param {string} opts.sourceUrl    external image URL (runtime-only; never stored/logged)
 * @param {string} opts.pathPrefix   deterministic path WITHOUT extension, e.g.
 *                                    "channels/<id>" or "tokens/<chain>/<addr>"
 * @param {string} [opts.fallbackExt="jpg"]
 * @param {string} [opts.fallbackContentType="image/jpeg"]
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.maxBytes]
 * @returns {Promise<{ publicUrl:string, path:string, ext:string, contentType:string, hash:string, byteLength:number }>}
 */
export async function resolveAndStoreImage(supabase, opts) {
  const {
    sourceUrl,
    pathPrefix,
    fallbackExt = "jpg",
    fallbackContentType = "image/jpeg",
    timeoutMs,
    maxBytes,
  } = opts;

  const { bytes, contentType } = await withRetries(() =>
    downloadImage(sourceUrl, { timeoutMs, maxBytes })
  );

  const resolvedContentType =
    contentType && contentType.startsWith("image/") ? contentType : fallbackContentType;
  const ext = extForContentType(resolvedContentType, fallbackExt);
  const path = `${pathPrefix}.${ext}`;

  const cleanUrl = await withRetries(() =>
    storeImageAsset(supabase, {
      path,
      bytes,
      contentType: resolvedContentType,
    })
  );

  const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 10);
  const publicUrl = `${cleanUrl}?v=${hash}`;

  return {
    publicUrl,
    path,
    ext,
    contentType: resolvedContentType,
    hash,
    byteLength: bytes.length,
  };
}

/**
 * Resolve and persist a Telegram channel avatar without exposing the bot URL
 * beyond this process. The returned source id is safe to keep as metadata.
 */
export async function resolveTelegramAvatar(
  botToken,
  handle,
  supabase,
  channelId,
  options = {}
) {
  const username = handle.replace(/^@/, "");
  const chatResponse = await withRetries(() => axios.get(
    "https://api.telegram.org/bot" + botToken + "/getChat",
    { params: { chat_id: "@" + username }, timeout: 8_000 }
  ));
  const photo = chatResponse.data?.result?.photo;
  if (!photo?.big_file_id) return null;

  if (
    options.hasStableAsset &&
    options.currentSourceId &&
    options.currentSourceId === photo.big_file_unique_id
  ) {
    return {
      publicUrl: null,
      sourceId: photo.big_file_unique_id,
      unchanged: true,
    };
  }

  const fileResponse = await withRetries(() => axios.get(
    "https://api.telegram.org/bot" + botToken + "/getFile",
    { params: { file_id: photo.big_file_id }, timeout: 8_000 }
  ));
  const filePath = fileResponse.data?.result?.file_path;
  if (!filePath) return null;

  const sourceUrl = "https://api.telegram.org/file/bot" + botToken + "/" + filePath;
  const { publicUrl } = await resolveAndStoreImage(supabase, {
    sourceUrl,
    pathPrefix: "channels/" + channelId,
    fallbackExt: "jpg",
    fallbackContentType: "image/jpeg",
  });

  return {
    publicUrl,
    sourceId: photo.big_file_unique_id ?? null,
  };
}
