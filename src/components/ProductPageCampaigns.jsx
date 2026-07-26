"use client";
import { useSelector } from "react-redux";
import CampaignSection from "./CampaignSection";

// Extracted unchanged from the old product/[product]/page.jsx. Stays
// client-side because it reads the campaigns list straight from Redux —
// exactly the same filter as before (`showOnProductPage && isActive`),
// this doesn't depend on which specific product is being viewed at all,
// same as the original.
export default function ProductPageCampaigns() {
  const campaigns = useSelector((s) => s.campaign.campaigns);
  const productPageCampaigns = campaigns.filter((c) => c.showOnProductPage && c.isActive);

  return (
    <>
      {productPageCampaigns.map((c) => <CampaignSection key={c._id} campaign={c} />)}
    </>
  );
}
