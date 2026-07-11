import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import input from "input"

import {
  loadScraperEnv,
  logScraperEnvStatus,
  reportSupabaseEnvFormatting,
  validateScraperEnv,
} from "../src/lib/env/scraper-env.js"

const envState = loadScraperEnv(import.meta.url)
logScraperEnvStatus(envState)
reportSupabaseEnvFormatting()

const { telegram } = validateScraperEnv()

const stringSession = new StringSession(telegram.session)

const client = new TelegramClient(stringSession, telegram.apiId, telegram.apiHash, {
  connectionRetries: 5,
})

async function main() {
  await client.start({
    phoneNumber: async () => await input.text("Phone number: "),
    password: async () => await input.text("2FA Password (if any): "),
    phoneCode: async () => await input.text("Code from Telegram: "),
    onError: (err) => console.log(err),
  })

  console.log("\nLOGIN SUCCESSFUL\n")

  console.log("YOUR SESSION STRING:\n")
  console.log(client.session.save())
}

main().catch((err) => {
  console.error("[scraper-login] Startup failed:", err.message)
  process.exitCode = 1
})
