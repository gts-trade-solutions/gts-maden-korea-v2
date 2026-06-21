// app/admin/marketing/facebook/components/FacebookDashboard.jsx
"use client";

import ConnectAccountCard from "./ConnectAccountCard";
import CampaignList from "./CampaignList";

export default function FacebookDashboard() {
  return (
    <div className="grid gap-6 md:grid-cols-[2fr,3fr]">
      {/* Left side – connection status / tokens */}
      <ConnectAccountCard />

      {/* Right side – campaigns overview */}
      <CampaignList />
    </div>
  );
}
