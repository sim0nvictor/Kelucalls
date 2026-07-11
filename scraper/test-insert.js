import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
})

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const { data, error } = await supabase
    .from("channels")
    .insert({
      slug: "test-channel",
      title: "Test Channel",
      telegram_handle: "@test",
      telegram_url: "https://t.me/test",
      status: "active",
    })
    .select()

  if (error) {
    console.error(error)
    return
  }

  console.log("INSERT SUCCESS")
  console.log(data)
}

main()