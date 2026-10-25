import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  sourcemap: true,
  clean: true,
  // The cartridge schema is bundled, so dist/ runs without the workspace.
  noExternal: [/^@baseland\//],
  banner: { js: "#!/usr/bin/env node" },
});
