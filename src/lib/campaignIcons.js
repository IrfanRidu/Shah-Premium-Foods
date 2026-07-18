import { FaBolt, FaGift, FaFire, FaTag, FaStar, FaPercent } from "react-icons/fa";

// Admin picks one of these keys when creating a Campaign. Unknown/blank → bolt (classic "Flash Sale" look).
export const CAMPAIGN_ICONS = {
  bolt:    { icon: FaBolt,    label: "Bolt (Flash Sale)" },
  gift:    { icon: FaGift,    label: "Gift (Special Offer)" },
  fire:    { icon: FaFire,    label: "Fire (Hot Deal)" },
  tag:     { icon: FaTag,     label: "Tag (Sale)" },
  star:    { icon: FaStar,    label: "Star (Featured)" },
  percent: { icon: FaPercent, label: "Percent (Discount)" },
};

export const getCampaignIcon = (key) => CAMPAIGN_ICONS[key]?.icon || FaBolt;
export const getCampaignIconLabel = (key) => CAMPAIGN_ICONS[key]?.label || CAMPAIGN_ICONS.bolt.label;
