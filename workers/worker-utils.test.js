import assert from "node:assert/strict";
import { test } from "node:test";

import { getSupabaseConfig, loadWorkerEnv } from "./worker-utils.js";

test("worker env loader skips dotenv-file checks when disabled", () => {
  const previousValues = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
  };

  process.env.SUPABASE_URL = "https://test-project.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  try {
    const result = loadWorkerEnv(import.meta.url, { loadDotenvFiles: false });

    assert.equal(result.envExists, undefined);
    assert.equal(result.localEnvExists, undefined);
    assert.deepEqual(getSupabaseConfig(), {
      url: "https://test-project.invalid",
      key: "test-service-role-key",
    });
  } finally {
    for (const [name, value] of Object.entries(previousValues)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});