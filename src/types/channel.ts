export type ChannelCategory =
  | "Alpha Calls"
  | "Memecoins"
  | "Airdrops"
  | "Research"
  | "Trading"
  | "Education";

export type Channel = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  telegramUrl: string;
  category: ChannelCategory;
  members: string;
  status: string;
  source: string;
  sourceUrl?: string;
  verified: boolean;
  priceFocus: string;
  accent: string;
  featured?: boolean;
  trending?: boolean;
  top?: boolean;
  isNew?: boolean;
};
