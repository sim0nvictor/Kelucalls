export type BotEventType = "achievement" | "new_call" | "trending" | "coordinated_call";

export type BotEvent = {
  id: string;
  event_type: BotEventType;
  channel_id: string | null;
  call_id: string | null;
  token_id: string | null;
  payload: Record<string, unknown> | null;
  processed: boolean;
  processed_at: string | null;
  attempts: number;
};

export type TelegramUser = {
  id: string;
  telegram_chat_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
};

export type AlertPreferences = {
  telegram_user_id: string;
  achievement_alerts_enabled: boolean;
  smart_call_alerts_enabled: boolean;
  min_score: number;
  chains: string[];
  verified_channels_only: boolean;
  achievement_thresholds: number[];
};

export type TrendingTokenRow = {
  id: string;
  symbol: string;
  name: string | null;
  chain: string;
  contract_address: string | null;
  total_calls: number;
  unique_channels: number;
  average_roi_pct: number;
  best_multiple: number;
};

export type TopKolRow = {
  channel_id: string;
  ranking_score: number;
  win_rate_pct: number;
  best_multiple: number;
  total_calls: number;
  channels: { title: string; slug: string; telegram_handle: string | null; is_verified: boolean } | null;
};

export type CallAlertRow = {
  id: string;
  channel_id: string;
  token_id: string;
  called_at: string;
  detected_symbol: string | null;
  detected_contract_address: string | null;
  telegram_message_id: string | number | null;
  entry_price_usd: number;
  confidence_score: number;
  channels: {
    title: string;
    slug: string;
    telegram_handle: string | null;
    telegram_url: string | null;
    is_verified: boolean;
  } | null;
  tokens: { symbol: string; chain: string; contract_address: string | null } | null;
  call_metrics: { current_roi_pct: number; peak_multiple: number } | null;
};
