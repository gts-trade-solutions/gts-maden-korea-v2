import "server-only";
import { PrismaClient } from "@prisma/client";

// Single shared Prisma client. In dev, Next.js hot-reloads modules, which would
// otherwise spawn a new connection pool on every edit — so we cache it on
// globalThis. This is the one place the app talks to local MySQL.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
