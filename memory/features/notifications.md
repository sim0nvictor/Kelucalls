## Alerts & Notifications (in-app)

**What it is:** `/account/alerts` and the notification bell — users configure rules ("tell me when Channel X calls something new," "tell me when a token's KeluScore spikes") and see the results in an in-app inbox.

**How it works:**
- A user creates a rule via `create-alert-form.tsx` → `createAlertRuleAction()`, stored in `user_alert_rules` with a `rule_type` (extensible — a new alert kind is just a new enum value, never a new table), optional `token_id`/`channel_id` target, and `conditions jsonb` for thresholds like minimum score delta.
- `workers/intent-alerts.js` polls `score_changes` (written by the scoring worker whenever a score moves past its own threshold) every 5 minutes, matches unresolved changes against active rules, checks two independent "am I allowed to notify this person" gates — the rule's own `is_active` flag, and the account-wide master notification switch — and inserts into `user_notifications`.
- **Delivery is deliberately at-least-once**: the notification is written *before* the source row is marked processed, so a crash mid-dispatch causes a re-send rather than a silent drop. "Duplicate notifications are annoying; missing alerts are a broken feature" is the stated design rationale.
- `notification-bell.tsx` fetches the unread count client-side, after the page has already loaded — this keeps ordinary marketing/dashboard pages statically cacheable, since checking notifications requires a per-user session read that would otherwise force every page using the navbar to be dynamic.

**Master switch behavior:** turning notifications off globally doesn't delete or disable individual alert rules — it's checked as a *second, independent* gate, so turning it back on instantly restores exactly the rules that were already configured. And accounts created before this switch existed are treated as "on" by default, since they never explicitly opted out.

---
