import 'dotenv/config'
import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"

const client = new TelegramClient(
  new StringSession(process.env.TELEGRAM_SESSION),
  Number(process.env.TELEGRAM_API_ID),
  process.env.TELEGRAM_API_HASH,
  { connectionRetries: 5 }
)

await client.connect()

const me = await client.getMe()

console.log("Logged in as:", me.username || me.firstName)
