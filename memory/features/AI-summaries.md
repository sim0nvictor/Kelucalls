## 5. KeluScore AI Summaries

**What it is:** A 2–3 sentence plain-English narrative attached to a token's KeluScore explaining what the data shows — visible alongside the score, not a replacement for it.

**How it works:** `workers/intent-summaries.js` runs on a much slower cadence (default every 6 hours) than the scoring worker, calling an OpenAI-compatible chat completion endpoint (works with any compatible provider via one env var — no vendor SDK dependency). It only regenerates a summary when the score has moved meaningfully (≥5 points) or the cached one has gone stale (>7 days) or the prompt itself changed — capped at 40 tokens per cycle to control API cost. The system prompt hard-rules the model to: only use the provided data, never invent numbers or predict prices, never say buy/sell, and explicitly describe a missing sub-score as "unavailable" rather than implying it's weak or bad. If no API key is configured, this worker does nothing — it never fabricates or shows a placeholder summary.

**Why it's a separate worker/table from the score itself:** so a dead API key or a slow LLM response can never block the actual scoring pipeline, which is the feature people actually rely on.

---