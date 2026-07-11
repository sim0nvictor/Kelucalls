# Railway Procfile
# Format: <process_type>: <command>
#
# Web: Next.js production server
# Scraper: Telegram scraper worker (background)
# Price-worker: Updates call prices from DexScreener
# Trending-worker: Aggregates trending tokens

web: npm run start
scraper: node scraper/index.js
price-worker: node workers/price-update.js
trending-worker: node workers/trending-aggregate.js