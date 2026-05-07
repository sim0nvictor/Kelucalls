/**
 * Supabase Database type definitions for KeluCall.
 *
 * These types mirror the schema in supabase/migrations/20260504_kelucalls_rebuild.sql.
 * Regenerate with `npx supabase gen types typescript` when the schema changes.
 */

export type ChannelStatus = "pending" | "active" | "paused" | "archived";
export type CallStatus = "open" | "closed" | "invalid";
export type SubmissionStatus = "pending" | "approved" | "rejected";
export type AdStatus = "draft" | "active" | "paused" | "expired";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      channels: {
        Row: {
          id: string;
          slug: string;
          telegram_handle: string;
          telegram_url: string;
          title: string;
          description: string | null;
          avatar_url: string | null;
          status: ChannelStatus;
          is_paid_channel: boolean;
          is_verified: boolean;
          notes: string | null;
          metadata: Json;
          approved_at: string | null;
          last_scraped_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          telegram_handle: string;
          telegram_url: string;
          title: string;
          description?: string | null;
          avatar_url?: string | null;
          status?: ChannelStatus;
          is_paid_channel?: boolean;
          is_verified?: boolean;
          notes?: string | null;
          metadata?: Json;
          approved_at?: string | null;
          last_scraped_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["channels"]["Insert"]>;
      };

      tokens: {
        Row: {
          id: string;
          symbol: string;
          name: string | null;
          chain: string;
          contract_address: string | null;
          coingecko_id: string | null;
          dexscreener_pair_id: string | null;
          last_price_usd: number | null;
          last_market_cap_usd: number | null;
          last_seen_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          name?: string | null;
          chain?: string;
          contract_address?: string | null;
          coingecko_id?: string | null;
          dexscreener_pair_id?: string | null;
          last_price_usd?: number | null;
          last_market_cap_usd?: number | null;
          last_seen_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tokens"]["Insert"]>;
      };

      calls: {
        Row: {
          id: string;
          channel_id: string;
          token_id: string;
          telegram_message_id: string | null;
          message_text: string;
          called_at: string;
          detected_symbol: string | null;
          detected_contract_address: string | null;
          entry_price_usd: number;
          entry_market_cap_usd: number | null;
          confidence_score: number;
          status: CallStatus;
          source_metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          token_id: string;
          telegram_message_id?: string | null;
          message_text: string;
          called_at: string;
          detected_symbol?: string | null;
          detected_contract_address?: string | null;
          entry_price_usd: number;
          entry_market_cap_usd?: number | null;
          confidence_score?: number;
          status?: CallStatus;
          source_metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["calls"]["Insert"]>;
      };

      call_metrics: {
        Row: {
          call_id: string;
          current_price_usd: number | null;
          current_market_cap_usd: number | null;
          peak_price_usd: number | null;
          peak_market_cap_usd: number | null;
          current_roi_pct: number;
          peak_roi_pct: number;
          current_multiple: number;
          peak_multiple: number;
          is_win: boolean;
          hit_2x: boolean;
          hit_5x: boolean;
          hit_10x: boolean;
          hit_50x: boolean;
          hit_100x: boolean;
          simulated_investment_usd: number;
          simulated_current_value_usd: number;
          simulated_peak_value_usd: number;
          simulated_current_pnl_usd: number;
          simulated_peak_pnl_usd: number;
          refreshed_at: string;
        };
        Insert: {
          call_id: string;
          current_price_usd?: number | null;
          current_market_cap_usd?: number | null;
          peak_price_usd?: number | null;
          peak_market_cap_usd?: number | null;
          current_roi_pct?: number;
          peak_roi_pct?: number;
          current_multiple?: number;
          peak_multiple?: number;
          is_win?: boolean;
          hit_2x?: boolean;
          hit_5x?: boolean;
          hit_10x?: boolean;
          hit_50x?: boolean;
          hit_100x?: boolean;
          simulated_investment_usd?: number;
          simulated_current_value_usd?: number;
          simulated_peak_value_usd?: number;
          simulated_current_pnl_usd?: number;
          simulated_peak_pnl_usd?: number;
          refreshed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["call_metrics"]["Insert"]>;
      };

      channel_stats: {
        Row: {
          channel_id: string;
          total_calls: number;
          wins: number;
          losses: number;
          win_rate_pct: number;
          average_roi_pct: number;
          median_roi_pct: number;
          average_peak_roi_pct: number;
          average_multiple: number;
          best_multiple: number;
          hit_2x_count: number;
          hit_5x_count: number;
          hit_10x_count: number;
          hit_50x_count: number;
          hit_100x_count: number;
          simulated_investment_usd: number;
          simulated_current_value_usd: number;
          simulated_peak_value_usd: number;
          simulated_current_pnl_usd: number;
          simulated_peak_pnl_usd: number;
          ranking_score: number;
          refreshed_at: string;
        };
        Insert: {
          channel_id: string;
          total_calls?: number;
          wins?: number;
          losses?: number;
          win_rate_pct?: number;
          average_roi_pct?: number;
          median_roi_pct?: number;
          average_peak_roi_pct?: number;
          average_multiple?: number;
          best_multiple?: number;
          hit_2x_count?: number;
          hit_5x_count?: number;
          hit_10x_count?: number;
          hit_50x_count?: number;
          hit_100x_count?: number;
          simulated_investment_usd?: number;
          simulated_current_value_usd?: number;
          simulated_peak_value_usd?: number;
          simulated_current_pnl_usd?: number;
          simulated_peak_pnl_usd?: number;
          ranking_score?: number;
          refreshed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["channel_stats"]["Insert"]>;
      };

      submissions: {
        Row: {
          id: string;
          telegram_handle: string;
          telegram_url: string | null;
          channel_name: string;
          description: string | null;
          submitter_contact: string | null;
          fast_track_requested: boolean;
          status: SubmissionStatus;
          review_notes: string | null;
          approved_channel_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          telegram_handle: string;
          telegram_url?: string | null;
          channel_name: string;
          description?: string | null;
          submitter_contact?: string | null;
          fast_track_requested?: boolean;
          status?: SubmissionStatus;
          review_notes?: string | null;
          approved_channel_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["submissions"]["Insert"]>;
      };

      ads: {
        Row: {
          id: string;
          channel_id: string;
          label: string;
          placement: string;
          destination_url: string;
          creative_copy: string | null;
          starts_at: string;
          ends_at: string | null;
          priority: number;
          status: AdStatus;
          budget_usd: number | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          label: string;
          placement: string;
          destination_url: string;
          creative_copy?: string | null;
          starts_at: string;
          ends_at?: string | null;
          priority?: number;
          status?: AdStatus;
          budget_usd?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ads"]["Insert"]>;
      };
    };

    Views: {
      trending_tokens: {
        Row: {
          id: string;
          symbol: string;
          name: string | null;
          chain: string;
          contract_address: string | null;
          total_calls: number;
          unique_channels: number;
          last_called_at: string | null;
          average_roi_pct: number;
          best_multiple: number;
        };
      };
    };

    Functions: {
      refresh_channel_stats: {
        Args: { target_channel_id?: string | null };
        Returns: void;
      };
    };
  };
}
