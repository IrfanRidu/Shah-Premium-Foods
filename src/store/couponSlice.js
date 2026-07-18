import { createSlice } from "@reduxjs/toolkit";
const couponSlice = createSlice({
  name: "coupon",
  initialState: { activeCoupons: [], appliedCoupon: null, discount: 0 },
  reducers: {
    setActiveCoupons: (s, a) => { s.activeCoupons = a.payload || []; },
    setAppliedCoupon: (s, a) => { s.appliedCoupon = a.payload?.coupon || null; s.discount = a.payload?.discount || 0; },
    clearAppliedCoupon: (s) => { s.appliedCoupon = null; s.discount = 0; },
  },
});
export const { setActiveCoupons, setAppliedCoupon, clearAppliedCoupon } = couponSlice.actions;
export default couponSlice.reducer;
