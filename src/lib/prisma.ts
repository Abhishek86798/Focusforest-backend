import { PrismaClient } from "@prisma/client";

// Singleton pattern: reuse the same Prisma Client instance in development
// to avoid exhausting DB connections during hot-reload with ts-node-dev.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
