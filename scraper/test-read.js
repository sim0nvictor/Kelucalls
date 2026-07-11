import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
})

console.log("ENV PATH:", path.resolve(__dirname, "../.env"))

console.log("API ID:", process.env.TELEGRAM_API_ID)
console.log("API HASH:", process.env.TELEGRAM_API_HASH)

dotenv.config({ path: "../.env" })

import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"

const apiId = Number(process.env.TELEGRAM_API_ID)
const apiHash = process.env.TELEGRAM_API_HASH
const session = process.env.TELEGRAM_SESSION

const client = new TelegramClient(
  new StringSession(session),
  apiId,
  apiHash,
  {
    connectionRetries: 5,
  }
)

async function main() {
  console.log("Connecting to Telegram...")

  await client.connect()

  console.log("Connected successfully.")

  const dialogs = await client.getDialogs({ limit: 10 })

  console.log("\n=== CHANNELS / CHATS ===\n")

  for (const dialog of dialogs) {
    console.log(dialog.name)
  }

  console.log("\nScraper can successfully read Telegram.")
}

if (!process.env.TELEGRAM_API_ID) {
  throw new Error("Missing TELEGRAM_API_ID")
}

if (!process.env.TELEGRAM_API_HASH) {
  throw new Error("Missing TELEGRAM_API_HASH")
}


main().catch(console.error)