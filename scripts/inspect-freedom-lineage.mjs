import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log("=== FREEDOM DATA LINEAGE INVESTIGATION ===");

  const callId = "0d24cf82-5267-4ca5-855b-ebf25a32d13b";

  // 1. Call record
  const { data: call } = await supabase
    .from("calls")
    .select("*")
    .eq("id", callId)
    .single();

  console.log("\n1. CALL RECORD:", JSON.stringify(call, null, 2));

  // 2. Telegram message record (if source_message_id or channel + telegram_message_id)
  let rawMessage = null;
  if (call.source_message_id) {
    const { data: msg } = await supabase
      .from("telegram_messages")
      .select("*")
      .eq("id", call.source_message_id)
      .maybeSingle();
    rawMessage = msg;
  }
  if (!rawMessage && call.telegram_message_id) {
    const { data: msg } = await supabase
      .from("telegram_messages")
      .select("*")
      .eq("telegram_message_id", call.telegram_message_id)
      .eq("channel_id", call.channel_id)
      .maybeSingle();
    rawMessage = msg;
  }

  console.log("\n2. RAW TELEGRAM MESSAGE:", JSON.stringify(rawMessage, null, 2));

  // 3. Token record
  const { data: token } = await supabase
    .from("tokens")
    .select("*")
    .eq("id", call.token_id)
    .single();

  console.log("\n3. TOKEN RECORD:", JSON.stringify(token, null, 2));

  // 4. Also check token by detected address in message: 0xc757023a9bd9bc404b8438bc4bd50f3ccd147c2b
  const { data: tokenByAddress } = await supabase
    .from("tokens")
    .select("*")
    .ilike("contract_address", "0xc757023a9bd9bc404b8438bc4bd50f3ccd147c2b")
    .maybeSingle();

  console.log("\n4. TOKEN RECORD FOR ADDRESS IN MESSAGE (0xc757023a...):", JSON.stringify(tokenByAddress, null, 2));

  // 5. Call metrics record
  const { data: metric } = await supabase
    .from("call_metrics")
    .select("*")
    .eq("call_id", callId)
    .single();

  console.log("\n5. CALL METRIC RECORD:", JSON.stringify(metric, null, 2));
}

run();
