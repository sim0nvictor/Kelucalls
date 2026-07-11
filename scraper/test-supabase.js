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
  console.log("Testing Supabase connection...")

  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .limit(1)

  if (error) {
    console.error("SUPABASE ERROR:")
    console.error(error)
    return
  }

  console.log("SUPABASE CONNECTED SUCCESSFULLY")
  console.log(data)
}

main()