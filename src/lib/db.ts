import { PrismaClient, Prisma } from "@prisma/client";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
