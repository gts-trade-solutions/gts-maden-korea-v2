// The standalone /influencer/promos page was retired — it duplicated
// the dashboard's create-promo card with subtly different validation
// (hardcoded 100% bounds, no regions card, no admin-set default
// split). The dashboard at /influencer is now the single source of
// truth for creating + listing an influencer's promo codes.
//
// This file stays only as a permanent redirect so existing bookmarks
// and any stale internal links keep landing somewhere useful.

import { redirect } from "next/navigation";

export default function InfluencerPromosRedirect() {
  redirect("/influencer");
}
