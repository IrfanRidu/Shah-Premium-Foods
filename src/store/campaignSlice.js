import { createSlice } from "@reduxjs/toolkit";
const campaignSlice = createSlice({
  name: "campaign",
  initialState: { campaigns: [], loading: false },
  reducers: {
    setCampaigns: (s, a) => { s.campaigns = a.payload || []; },
    setCampaignLoading: (s, a) => { s.loading = a.payload; },
    addCampaign: (s, a) => { s.campaigns.unshift(a.payload); },
    updateCampaign: (s, a) => { const i = s.campaigns.findIndex(x => x._id === a.payload._id); if (i !== -1) s.campaigns[i] = a.payload; },
    removeCampaign: (s, a) => { s.campaigns = s.campaigns.filter(x => x._id !== a.payload); },
  },
});
export const { setCampaigns, setCampaignLoading, addCampaign, updateCampaign, removeCampaign } = campaignSlice.actions;
export default campaignSlice.reducer;
