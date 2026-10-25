// Writes play.schema.json, for clients that don't speak zod (Swift, the MCP
// skill, humans). Regenerate after changing src/index.ts.
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { Cartridge } from "../src/index.js";

const schema = z.toJSONSchema(Cartridge, { io: "input", unrepresentable: "any" });
writeFileSync(new URL("../play.schema.json", import.meta.url), JSON.stringify(schema, null, 2) + "\n");
console.log("wrote play.schema.json");
