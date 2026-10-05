import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { mkdir } from "node:fs/promises";
await mkdir(".data", { recursive: true });
const db = await PGlite.create({
  dataDir: ".data/postgres",
  extensions: { vector },
});
await db.exec("CREATE EXTENSION IF NOT EXISTS vector");
const server = new PGLiteSocketServer({
  db,
  host: "127.0.0.1",
  port: 5433,
  maxConnections: 64,
});
await server.start();
console.log(
  "Local development PostgreSQL listening on 127.0.0.1:5433. Data persists in .data/postgres.",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
