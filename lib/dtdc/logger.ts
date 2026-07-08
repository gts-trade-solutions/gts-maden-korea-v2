import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

type LogArgs = {
  shipment_id?: string | null;
  api_name: "create" | "label" | "cancel" | "track" | "auth";
  endpoint: string;
  request?: any;
  response?: any;
  http_status?: number | null;
  success: boolean;
};

export async function logDtdcApi(args: LogArgs) {
  try {
    await prisma.dtdc_api_logs.create({
      data: {
        id: randomUUID(),
        shipment_id: args.shipment_id ?? null,
        api_name: args.api_name,
        endpoint: args.endpoint,
        request: (args.request ?? Prisma.DbNull) as any,
        response: (args.response ?? Prisma.DbNull) as any,
        http_status: args.http_status ?? null,
        success: args.success,
      },
    });
  } catch {
    // Safe ignore: logging should never break checkout/admin actions
  }
}
