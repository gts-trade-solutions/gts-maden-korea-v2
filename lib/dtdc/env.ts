import "server-only";

function must(name: string, v: string | undefined) {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const DTDC_ENV = (process.env.DTDC_TRACK_ENV || "staging") as
  | "staging"
  | "production";

export const DTDC_SHIPSY = {
  baseUrl: must("DTDC_SHIPSY_BASE_URL", process.env.DTDC_SHIPSY_BASE_URL).replace(/\/$/, ""),
  apiKey: must("DTDC_SHIPSY_API_KEY", process.env.DTDC_SHIPSY_API_KEY),
  customerCode: must("DTDC_CUSTOMER_CODE", process.env.DTDC_CUSTOMER_CODE),
  defaultServiceTypeId: must("DTDC_DEFAULT_SERVICE_TYPE_ID", process.env.DTDC_DEFAULT_SERVICE_TYPE_ID),
  defaultCommodityId: must("DTDC_DEFAULT_COMMODITY_ID", process.env.DTDC_DEFAULT_COMMODITY_ID),
  defaultLoadType: process.env.DTDC_DEFAULT_LOAD_TYPE || "NONDOCUMENT",
  label4x6: process.env.DTDC_LABEL_CODE_4X6 || "SHIP_LABEL_4X6",
  labelA4: process.env.DTDC_LABEL_CODE_A4 || "SHIP_LABEL_A4",
};

export const DTDC_TRACKING = {
  authUrl: must("DTDC_TRACK_AUTH_URL", process.env.DTDC_TRACK_AUTH_URL),
  detailsUrl: must("DTDC_TRACK_DETAILS_URL", process.env.DTDC_TRACK_DETAILS_URL),
  username: must("DTDC_TRACK_USERNAME", process.env.DTDC_TRACK_USERNAME),
  password: must("DTDC_TRACK_PASSWORD", process.env.DTDC_TRACK_PASSWORD),
  tokenMaxAgeMinutes: Number(process.env.DTDC_TRACK_TOKEN_MAX_AGE_MINUTES || "720"),
};
