import bcrypt from "bcryptjs";
import prismaPackage from "@prisma/client";

const { PrismaClient } = prismaPackage;

const prisma = new PrismaClient();

const channels = [
  {
    slug: "kelus-call",
    name: "Kelus Call",
    tagline: "Precision crypto calls built for fast movers.",
    description:
      "Kelus Call is the flagship alpha room for traders who want concise setups, clean levels, and high-conviction Telegram alerts before momentum explodes.",
    telegramUrl: "https://t.me/kELUSCALLGOOOO",
    category: "ALPHA_CALLS",
    membersLabel: "4,956 subscribers",
    status: "VERIFIED",
    sourceLabel: "Telemetr and TGStat third-party Telegram indexes",
    sourceUrl: "https://telemetr.io/en/channels/2141316726-keluscallgoooo",
    verified: true,
    priceFocus: "Low-cap gems, breakouts, and smart-money entries",
    accent: "from-cyan-400 via-sky-500 to-emerald-400",
    featured: true,
    trending: true,
    top: true,
    isNew: false
  },
  {
    slug: "orbit-snipers",
    name: "Orbit Snipers",
    tagline: "Momentum entries for on-chain traders.",
    description:
      "A fast-moving community covering trending tokens, sniper watchlists, and intraday catalysts across ETH and Solana ecosystems.",
    telegramUrl: "https://t.me/orbitsnipers",
    category: "TRADING",
    membersLabel: "Pending verification",
    status: "PENDING_REVIEW",
    sourceLabel: "Mock listing until a live public channel link is provided",
    sourceUrl: null,
    verified: false,
    priceFocus: "Intraday trend trades and breakout scanners",
    accent: "from-fuchsia-500 via-violet-500 to-cyan-400",
    featured: false,
    trending: true,
    top: true,
    isNew: false
  },
  {
    slug: "airdrop-command",
    name: "Airdrop Command",
    tagline: "Curated airdrops with minimal noise.",
    description:
      "Dedicated to high-quality airdrop plays, farming calendars, and claim guides for users optimizing upside with limited time.",
    telegramUrl: "https://t.me/airdropcommand",
    category: "AIRDROPS",
    membersLabel: "Pending verification",
    status: "PENDING_REVIEW",
    sourceLabel: "Mock listing until a live public channel link is provided",
    sourceUrl: null,
    verified: false,
    priceFocus: "Airdrops, questing, and ecosystem farming",
    accent: "from-emerald-400 via-teal-500 to-cyan-500",
    featured: false,
    trending: true,
    top: false,
    isNew: true
  },
  {
    slug: "meme-radar",
    name: "Meme Radar",
    tagline: "Early meme rotation signals.",
    description:
      "Tracks narrative shifts, social acceleration, and meme coin rotations with a focus on speed and risk-managed position sizing.",
    telegramUrl: "https://t.me/memeradar",
    category: "MEMECOINS",
    membersLabel: "Pending verification",
    status: "PENDING_REVIEW",
    sourceLabel: "Mock listing until a live public channel link is provided",
    sourceUrl: null,
    verified: false,
    priceFocus: "Meme cycles and narrative momentum",
    accent: "from-orange-400 via-pink-500 to-fuchsia-500",
    featured: false,
    trending: false,
    top: true,
    isNew: false
  },
  {
    slug: "vault-research",
    name: "Vault Research",
    tagline: "Longer-form thesis, shorter path to conviction.",
    description:
      "Research-led community breaking down tokenomics, catalysts, and major ecosystem flows for swing traders and investors.",
    telegramUrl: "https://t.me/vaultresearch",
    category: "RESEARCH",
    membersLabel: "Pending verification",
    status: "PENDING_REVIEW",
    sourceLabel: "Mock listing until a live public channel link is provided",
    sourceUrl: null,
    verified: false,
    priceFocus: "Research notes, catalysts, and rotation theses",
    accent: "from-indigo-500 via-blue-500 to-cyan-400",
    featured: false,
    trending: false,
    top: true,
    isNew: false
  },
  {
    slug: "genesis-learn",
    name: "Genesis Learn",
    tagline: "Crypto education that stays practical.",
    description:
      "A beginner-friendly room focused on market structure, risk frameworks, and tactical education without the usual fluff.",
    telegramUrl: "https://t.me/genesislearn",
    category: "EDUCATION",
    membersLabel: "Pending verification",
    status: "PENDING_REVIEW",
    sourceLabel: "Mock listing until a live public channel link is provided",
    sourceUrl: null,
    verified: false,
    priceFocus: "Education, setups, and portfolio discipline",
    accent: "from-lime-400 via-emerald-500 to-cyan-500",
    featured: false,
    trending: false,
    top: false,
    isNew: true
  },
  {
    slug: "sol-shockwave",
    name: "SOL Shockwave",
    tagline: "Solana-first signal room.",
    description:
      "Covers Solana meme launches, ecosystem rotations, and fast risk-on setups for traders leaning into speed.",
    telegramUrl: "https://t.me/solshockwave",
    category: "TRADING",
    membersLabel: "Pending verification",
    status: "PENDING_REVIEW",
    sourceLabel: "Mock listing until a live public channel link is provided",
    sourceUrl: null,
    verified: false,
    priceFocus: "Solana momentum and launch tracking",
    accent: "from-purple-500 via-indigo-500 to-cyan-400",
    featured: false,
    trending: true,
    top: false,
    isNew: false
  }
];

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@kelucall.com";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "ADMIN",
      name: "Kelus Call Admin"
    },
    create: {
      email,
      passwordHash,
      role: "ADMIN",
      name: "Kelus Call Admin"
    }
  });

  for (const channel of channels) {
    await prisma.channel.upsert({
      where: { slug: channel.slug },
      update: channel,
      create: channel
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
