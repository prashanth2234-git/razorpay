import fs from "node:fs";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Load .env.local and .env for Prisma CLI in Next.js projects
for (const file of [".env.local", ".env"]) {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // ignore parse warnings if file is empty
    }
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL || env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx ./prisma/seed.ts",
  },
});
