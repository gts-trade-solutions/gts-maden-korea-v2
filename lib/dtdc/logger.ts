import "server-only";
import supabaseAdmin from "@/lib/supabaseAdmin";

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
    await supabaseAdmin.from("dtdc_api_logs").insert({
      shipment_id: args.shipment_id ?? null,
      api_name: args.api_name,
      endpoint: args.endpoint,
      request: args.request ?? null,
      response: args.response ?? null,
      http_status: args.http_status ?? null,
      success: args.success,
    });
  } catch {
    // Safe ignore: logging should never break checkout/admin actions
  }
}
