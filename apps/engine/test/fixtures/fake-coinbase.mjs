#!/usr/bin/env node
// Stand-in for the coinbase CLI in tests. Mirrors its output conventions:
// JSON on stdout for success; a JSON body plus an `error: ... (HTTP n)` line
// and exit 1 for failure.
const [cmd] = process.argv.slice(2);
if (cmd === "echo") {
  console.log(
    JSON.stringify({
      args: process.argv.slice(2),
      env: {
        COINBASE_ENV: process.env.COINBASE_ENV,
        COINBASE_NO_HISTORY: process.env.COINBASE_NO_HISTORY,
        hasConfigDir: Boolean(process.env.COINBASE_CONFIG_DIR),
        COINBASE_KEY_ID: process.env.COINBASE_KEY_ID ?? null,
        hasSecret: Boolean(process.env.COINBASE_KEY_SECRET),
        leakedParentEnv: Boolean(process.env.SHOULD_NOT_LEAK),
      },
    }),
  );
} else if (cmd === "forbidden") {
  console.error('{"errorType":"permission_denied","errorMessage":"User does not have access to portfolio"}');
  console.error("error: User does not have access to portfolio (HTTP 403) [trace 123, correlation abc]");
  process.exit(1);
} else if (cmd === "garbage") {
  console.log("not json");
} else if (cmd === "hang") {
  setTimeout(() => {}, 60_000);
}
