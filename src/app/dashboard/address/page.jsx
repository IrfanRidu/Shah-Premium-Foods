"use client";
import AddressBook from "@/components/AddressBook";

// This standalone route is kept for back-compat / anyone with it
// bookmarked, but is no longer linked from the dropdown or sidebar —
// "Addresses" now lives inside My Profile as a tab instead (see
// dashboard/profile/page.jsx). Same shared AddressBook component either
// way, so there's exactly one place the actual address CRUD logic lives.
export default function AddressPage() {
  return <AddressBook showHeading />;
}
