import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Tests cover the upstream parsers and the pure calculations they feed.
 *
 * Nothing here touches the network: every test hands the parser a fixture that
 * reproduces a real quirk of the feed (sentinel values, comment preambles,
 * unordered rows). That is the point — these formats are owned by third
 * parties, and the failure mode we care about is a silently wrong number
 * rather than a crash.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    // Mirrors the `@/*` path mapping in tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
