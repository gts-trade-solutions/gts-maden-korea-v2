// Prefix-based mapping from Indian PIN code to one of our six logistics
// zones (table `public.shipping_zones`). India uses 6-digit PINs where
// the leading digit identifies the postal region. We extend to the
// first two digits when needed to split a region that spans multiple
// zones (e.g. parts of Tamil Nadu vs Chennai metro).
//
// Source of truth for the zone keys: rows in `shipping_zones`
//   chennai_metro · tamil_nadu · south_india · north_india · northeast · islands
//
// Used by the cart + checkout pages to narrow the delivery ETA once
// the customer types their PIN. With no PIN we show the broadest
// India range.

export type IndianZoneKey =
  | "chennai_metro"
  | "tamil_nadu"
  | "south_india"
  | "north_india"
  | "northeast"
  | "islands";

/**
 * Resolve an Indian PIN code into one of the six logistics zones.
 * Returns null if the input isn't a valid 6-digit PIN. The mapping is
 * deliberately broad — we'd rather under-claim speed than over-promise
 * a delivery date and miss it.
 */
export function resolveIndianZone(pincode: string): IndianZoneKey | null {
  const pin = (pincode || "").trim();
  if (!/^\d{6}$/.test(pin)) return null;

  const two = pin.slice(0, 2);
  const first = pin[0];

  // Chennai metro: PIN starts 6000xx … 6001xx (and a sliver of 6002xx
  // for Greater Chennai). Treat the 600 prefix conservatively.
  if (pin.startsWith("600")) return "chennai_metro";

  // Andaman & Nicobar (744), Lakshadweep (682 5x..) → islands.
  if (pin.startsWith("744") || pin.startsWith("6826")) return "islands";

  // Northeast: 78x and 79x cover Assam, Arunachal, Manipur, Meghalaya,
  // Mizoram, Nagaland, Tripura.
  if (two === "78" || two === "79") return "northeast";

  // Rest of Tamil Nadu: 601..643. We've already taken 600 above; the
  // remaining 60..64 prefixes are TN-state ex-Chennai.
  if (
    pin.startsWith("60") ||
    pin.startsWith("61") ||
    pin.startsWith("62") ||
    pin.startsWith("63") ||
    pin.startsWith("64")
  ) {
    return "tamil_nadu";
  }

  // South India: Kerala (67x, 68x), Karnataka (56x..59x), Andhra/Telangana
  // (50x..53x), Puducherry/Karaikal (60x ex-TN range is rare). Capture
  // first-digit 5 and 6 (minus what's already matched above as TN/islands).
  if (first === "5") return "south_india";
  if (first === "6") return "south_india";

  // North India: everything else with first digit 1..4 and 7 (ex-NE):
  // Delhi (110), Haryana (12x), Punjab (14x..16x), HP (17x), J&K/Ladakh
  // (18x..19x), Rajasthan (3xx), Gujarat (36x..39x), UP (2xx), MP (4xx),
  // West Bengal (7xx ex 78/79 → handled above as NE), Odisha (75x..77x),
  // Maharashtra (4xx), Goa (403), Bihar (8xx)…
  // The mapping above doesn't carve Bihar/WB out separately because they
  // ship from the same hub as North India in this catalogue's setup;
  // adjust here if your logistics partner changes the zoning.
  return "north_india";
}
