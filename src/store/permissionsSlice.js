import { createSlice } from "@reduxjs/toolkit";
const permissionsSlice = createSlice({
  name: "permissions",
  initialState: { role: "", permissions: {}, loaded: false },
  reducers: {
    setPermissions: (s, a) => { s.role = a.payload?.role || ""; s.permissions = a.payload?.permissions || {}; s.loaded = true; },
    // Session 2 fix: `loaded` means "the initial permission check has
    // resolved" — true whether that resolution found real permissions
    // or found none (logged out / session expired). Previously this set
    // loaded:false, which is indistinguishable from "hasn't checked
    // yet" — dashboard/layout.jsx's access guard needs to tell those two
    // states apart to know when it's actually safe to redirect a
    // logged-out visitor away from a restricted page, rather than
    // showing a loading state forever because the check technically
    // "never loaded" even though it very much ran and resolved.
    clearPermissions: (s) => { s.role = ""; s.permissions = {}; s.loaded = true; },
  },
});
export const { setPermissions, clearPermissions } = permissionsSlice.actions;
export default permissionsSlice.reducer;
