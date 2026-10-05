import { copyFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
try {
  await access(".env");
} catch {
  await copyFile(".env.example", ".env");
}
for (const args of [
  ["prisma", "generate"],
  ["prisma", "migrate", "deploy"],
  ["tsx", "prisma/seed.ts"],
]) {
  const result = spawnSync(
    process.execPath,
    [
      args[0] === "prisma"
        ? "node_modules/prisma/build/index.js"
        : "node_modules/tsx/dist/cli.mjs",
      ...args.slice(1),
    ],
    { stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
