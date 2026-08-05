"use client";

import { useState } from "react";
import { ImageOff, Link2 } from "lucide-react";

type ImageUrlFieldProps = {
  /** Form field name submitted to the server action. */
  name: string;
  label: string;
  defaultValue?: string;
  helperText?: string;
  placeholder?: string;
  /** When provided, renders a companion alt-text input. */
  altName?: string;
  altLabel?: string;
  altDefaultValue?: string;
  /** CSS aspect-ratio value for the preview box. */
  aspectRatio?: string;
};

const ABSOLUTE_LINK = /^https?:\/\/\S+$/i;

/**
 * Image link input with live preview.
 *
 * Article banners are referenced by link instead of uploaded, so this field
 * validates the pasted link and previews it before the article is saved.
 */
export function ImageUrlField({
  name,
  label,
  defaultValue = "",
  helperText = "Paste a direct image link - no upload needed.",
  placeholder = "Paste a direct image link",
  altName,
  altLabel = "Image alt text",
  altDefaultValue = "",
  aspectRatio = "16/9",
}: ImageUrlFieldProps) {
  const [value, setValue] = useState(defaultValue);
  const [broken, setBroken] = useState(false);

  const trimmed = value.trim();
  const isLink = ABSOLUTE_LINK.test(trimmed);
  const showInvalid = trimmed.length > 0 && !isLink;

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </label>

      <div className="relative">
        <Link2 className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <input
          name={name}
          type="url"
          inputMode="url"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setBroken(false);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/10 bg-slate-900/80 py-3 pl-11 pr-24 text-white outline-none focus:border-cyan-400/50"
        />
        {trimmed.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              setBroken(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-white/8 px-3 py-1 text-xs text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>

      {showInvalid ? (
        <p className="text-xs text-rose-300">
          Enter a full image link starting with https - the article will not save otherwise.
        </p>
      ) : (
        <p className="text-xs text-slate-600">{helperText}</p>
      )}

      {isLink && (
        <div
          className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900/60"
          style={{ aspectRatio }}
        >
          {broken ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-500">
              <ImageOff className="size-6" />
              <span className="text-xs">That link could not be loaded.</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={trimmed}
              alt="Image link preview"
              referrerPolicy="no-referrer"
              onError={() => setBroken(true)}
              className="h-full w-full object-cover"
            />
          )}
        </div>
      )}

      {altName && (
        <div className="space-y-2 pt-1">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {altLabel}
          </label>
          <input
            name={altName}
            defaultValue={altDefaultValue}
            maxLength={200}
            placeholder="Describe the image for SEO and screen readers"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
          />
        </div>
      )}
    </div>
  );
}

export default ImageUrlField;
