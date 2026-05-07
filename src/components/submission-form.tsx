"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

const initialState = {
  telegramHandle: "",
  telegramUrl: "",
  channelName: "",
  description: "",
  submitterContact: "",
  fastTrackRequested: false
};

export function SubmissionForm() {
  const [form, setForm] = useState(initialState);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "Submission failed.");
        return;
      }

      setForm(initialState);
      setMessage("Submission received. It is now in the admin review queue.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input
        value={form.channelName}
        onChange={(event) => setForm((current) => ({ ...current, channelName: event.target.value }))}
        placeholder="Channel name"
        className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
      />
      <input
        value={form.telegramHandle}
        onChange={(event) => setForm((current) => ({ ...current, telegramHandle: event.target.value }))}
        placeholder="@telegramhandle"
        className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
      />
      <input
        value={form.telegramUrl}
        onChange={(event) => setForm((current) => ({ ...current, telegramUrl: event.target.value }))}
        placeholder="https://t.me/telegramhandle"
        className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
      />
      <textarea
        value={form.description}
        onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
        placeholder="What kind of calls does this channel post?"
        rows={4}
        className="rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
      />
      <input
        value={form.submitterContact}
        onChange={(event) => setForm((current) => ({ ...current, submitterContact: event.target.value }))}
        placeholder="Contact info for follow-up"
        className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
      />
      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={form.fastTrackRequested}
          onChange={(event) =>
            setForm((current) => ({ ...current, fastTrackRequested: event.target.checked }))
          }
          className="size-4"
        />
        Request fast-track review
      </label>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Submitting..." : "Submit channel"}
      </Button>
      {message ? <p className="text-sm text-slate-400">{message}</p> : null}
    </form>
  );
}
