import "server-only";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { DTDC_TRACKING, DTDC_ENV } from "./env";
import { logDtdcApi } from "./logger";

async function getCachedToken(): Promise<string | null> {
  const maxAgeMin = DTDC_TRACKING.tokenMaxAgeMinutes;

  const { data } = await supabaseAdmin
    .from("dtdc_tracking_tokens")
    .select("token, created_at, expires_at")
    .eq("env", DTDC_ENV)
    .order("created_at", { ascending: false })
    .limit(1);

  const row = data?.[0];
  if (!row?.token) return null;

  // If expires_at exists, respect it
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;

  // Otherwise, use max-age rule
  const createdAt = new Date(row.created_at).getTime();
  const ageMinutes = (Date.now() - createdAt) / (1000 * 60);
  if (ageMinutes > maxAgeMin) return null;

  return row.token;
}

async function saveToken(token: string, expires_at?: string | null) {
  await supabaseAdmin.from("dtdc_tracking_tokens").insert({
    env: DTDC_ENV,
    token,
    expires_at: expires_at ?? null,
  });
}

export async function dtdcTrackAuthenticate(force = false): Promise<string> {
  if (!force) {
    const cached = await getCachedToken().catch(() => null);
    if (cached) return cached;
  }

  const url = `${DTDC_TRACKING.authUrl}?username=${encodeURIComponent(
    DTDC_TRACKING.username
  )}&password=${encodeURIComponent(DTDC_TRACKING.password)}`;

  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const status = res.status;
  const json = await res.json().catch(() => null);

  // Token key name varies; keep it flexible
  const token =
    json?.Token ||
    json?.token ||
    json?.accessToken ||
    json?.["Token Access key"] ||
    json?.data?.token;

  await logDtdcApi({
    api_name: "auth",
    endpoint: url,
    request: { env: DTDC_ENV },
    response: json,
    http_status: status,
    success: res.ok && !!token,
  });

  if (!res.ok || !token) {
    throw new Error(json?.message || `DTDC tracking auth failed (${status})`);
  }

  await saveToken(String(token)).catch(() => {});
  return String(token);
}

export async function dtdcGetTrackDetails(params: {
  trkType: "cnno" | "reference";
  strcnno: string;
  addtnlDtl?: "Y" | "N";
}) {
  const token = await dtdcTrackAuthenticate(false);

  const payload = {
    trkType: params.trkType,
    strcnno: params.strcnno,
    addtnlDtl: params.addtnlDtl ?? "Y",
  };

  const call = async (tok: string) => {
    const res = await fetch(DTDC_TRACKING.detailsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Token": tok,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const status = res.status;
    const json = await res.json().catch(() => null);

    await logDtdcApi({
      api_name: "track",
      endpoint: DTDC_TRACKING.detailsUrl,
      request: payload,
      response: json,
      http_status: status,
      success: res.ok,
    });

    return { res, status, json };
  };

  // First try with cached token
  let r = await call(token);

  // If token is invalid/expired, refresh and retry once
  if (!r.res.ok && (r.status === 401 || r.status === 403)) {
    const newToken = await dtdcTrackAuthenticate(true);
    r = await call(newToken);
  }

  if (!r.res.ok) {
    const msg = r.json?.message || r.json?.error || `DTDC tracking failed (${r.status})`;
    throw new Error(msg);
  }

  return r.json;
}
