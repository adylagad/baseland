import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  sourcemap: true,
  clean: true,
  // Workspace packages are bundled; npm dependencies stay external and are
  // installed in the image (the coinbase CLI must exist as a real package).
  noExternal: [/^@baseland\//],
});
