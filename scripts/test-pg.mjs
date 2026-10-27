import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  // Test if we can inspect pg_proc or information_schema
  const { data, error } = await supabase
    .from("pg_proc")
    .select("proname")
    .limit(1);

  console.log("pg_proc result:", { data, error });
}

run();
