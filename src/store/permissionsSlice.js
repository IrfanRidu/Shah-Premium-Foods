import { createSlice } from "@reduxjs/toolkit";
const permissionsSlice = createSlice({
  name: "permissions",
  initialState: { role: "", permissions: {}, loaded: false },
  reducers: {
    setPermissions: (s, a) => { s.role = a.payload?.role || ""; s.permissions = a.payload?.permissions || {}; s.loaded = true; },
    clearPermissions: (s) => { s.role = ""; s.permissions = {}; s.loaded = false; },
  },
});
export const { setPermissions, clearPermissions } = permissionsSlice.actions;
export default permissionsSlice.reducer;
