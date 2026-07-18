import { createSlice } from "@reduxjs/toolkit";
const activitySlice = createSlice({
  name: "activity",
  initialState: { recentlyViewed: [], sessionId: "" },
  reducers: {
    setRecentlyViewed: (s, a) => { s.recentlyViewed = a.payload || []; },
    setSessionId: (s, a) => { s.sessionId = a.payload; },
  },
});
export const { setRecentlyViewed, setSessionId } = activitySlice.actions;
export default activitySlice.reducer;
