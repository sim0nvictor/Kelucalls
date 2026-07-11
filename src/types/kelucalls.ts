export type RankingMode = "smart" | "roi" | "win-rate" | "pnl";

export type ChannelStatus = "pending" | "active" | "paused" | "archived";
export type SubmissionStatus = "pending" | "approved" | "rejected";

export type ChannelSummary = {
  id: string;
  slug: string;
  title: string;
  telegramHandle: string;
  telegramUrl: string;
  description: string | null;
  status: ChannelStatus;
  isPaidChannel: boolean;
  isVerified: boolean;
  rankingScore: number | null;
  totalCalls: number;
  winRatePct: number;
  averageRoiPct: number;
  averagePeakRoiPct: number;
  averageMultiple: number;
  bestMultiple: number;
  hit2xCount: number;
  hit10xCount: number;
  hit100xCount: number;
  simulatedInvestmentUsd: number;
  simulatedCurrentValueUsd: number;
  simulatedCurrentPnlUsd: number;
  simulatedPeakPnlUsd: number;
  refreshedAt: string | null;
  avatarUrl: string | null;
};

export type LiveCall = {
  id: string;
  calledAt: string;
  channelSlug: string;
  channelTitle: string;
  tokenSymbol: string;
  tokenLogoUrl: string | null;
  contractAddress: string | null;
  entryPriceUsd: number;
  currentPriceUsd: number | null;
  peakPriceUsd: number | null;
  currentRoiPct: number;
  peakMultiple: number;
  hit2x: boolean;
  hit10x: boolean;
  hit100x: boolean;
};

export type TrendingToken = {
  id: string;
  symbol: string;
  name: string | null;
  chain: string;
  contractAddress: string | null;
  totalCalls: number;
  uniqueChannels: number;
  averageRoiPct: number;
  bestMultiple: number;
  lastCalledAt: string | null;
  logoUrl: string | null;
};

export type SponsoredPlacement = {
  id: string;
  label: string;
  placement: string;
  surface?: string;
  placementSubtype: string;
  destinationUrl: string;
  creativeCopy: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  channelSlug: string | null;
  channelTitle: string | null;
  tokenSymbol: string | null;
  contractAddress: string | null;
  status?: string;
  title?: string;
  logoUrl: string | null;
  startsAt?: string;
  endsAt?: string | null;
  priority?: number;
};

export type ChannelDetail = {
  summary: ChannelSummary;
  recentCalls: LiveCall[];
};

export type PublicSubmission = {
  id: string;
  telegramHandle: string;
  channelName: string;
  description: string | null;
  submitterContact: string | null;
  fastTrackRequested: boolean;
  status: SubmissionStatus;
  createdAt: string;
};

export type DashboardSnapshot = {
  isConfigured: boolean;
  leaderboard: ChannelSummary[];
  liveCalls: LiveCall[];
  trendingTokens: TrendingToken[];
  sponsoredPlacements: SponsoredPlacement[];
  totals: {
    trackedChannels: number;
    trackedCalls: number;
    simulatedPnlUsd: number;
    winRatePct: number;
    trackedTokens: number;
  };
};