"use client";

import { useRef, useState } from "react";
import { uploadAdBannerAction } from "@/app/kx-admin/actions";

/**
 * AdBannerUploader
 *
 * Self-contained client component that:
 * 1. Lets the admin pick/drag a banner image
 * 2. Uploads it to /api/admin/upload-banner immediately on select
 * 3. Writes the resulting public URL into a hidden <input name="imageUrl">
 *    and the storage path into <input name="imagePath"> so the parent
 *    server-action <form> can read them on submit without any prop passing.
 *
 * This is the correct Next.js 15 pattern — the server action form lives in
 * the server component; this component is a "client island" nested inside it.
 */
export function AdBannerUploader() {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<string | null>(null);
  const [imageUrl, setImageUrl]   = useState("");
  const [imagePath, setImagePath] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

async function handleFile(file: File) {
  if (file.size > 5 * 1024 * 1024) {
    setUploadError("File too large — max 5 MB.");
    return;
  }

  setPreview(URL.createObjectURL(file));
  setUploading(true);
  setUploadError(null);

  const fd = new FormData();
  fd.append("bannerFile", file);

  try {
    const result = await uploadAdBannerAction(fd);

    if (result.error) {
      setUploadError(result.error);
      setPreview(null);
      setImageUrl("");
      setImagePath("");
    } else {
      setImageUrl(result.publicUrl ?? "");
      setImagePath(result.storagePath ?? "");
    }
  } catch {
    setUploadError("Upload failed — please try again.");
    setPreview(null);
  } finally {
    setUploading(false);
  }
}
  function handleRemove() {
    setPreview(null);
    setImageUrl("");
    setImagePath("");
    setUploadError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
        Banner image <span className="text-slate-600">(optional)</span>
      </label>

      {/* Hidden inputs — the server-action form reads these on submit */}
      <input type="hidden" name="imageUrl"   value={imageUrl} />
      <input type="hidden" name="imagePath"  value={imagePath} />

      {preview ? (
        <div
          className="relative w-full overflow-hidden rounded-xl border border-white/10"
          style={{ aspectRatio: "16/7" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Banner preview" className="h-full w-full object-cover" />

          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70">
              <span className="text-sm text-white">Uploading…</span>
            </div>
          )}

          {!uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute right-2 top-2 rounded-full bg-slate-900/80 px-2.5 py-1 text-xs text-white hover:bg-slate-800"
            >
              Remove
            </button>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/3 text-sm text-slate-500 hover:border-white/30 hover:bg-white/5 transition-colors"
        >
          <span>Click or drag &amp; drop</span>
          <span className="mt-1 text-xs text-slate-600">JPEG · PNG · WebP · GIF · max 5 MB</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {uploadError && (
        <p className="text-xs text-red-400">{uploadError}</p>
      )}
    </div>
  );
}