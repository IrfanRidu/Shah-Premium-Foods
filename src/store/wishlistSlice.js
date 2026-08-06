import { createSlice } from "@reduxjs/toolkit";
const wishlistSlice = createSlice({ name:"wishlist", initialState:{wishlistItems:[]}, reducers:{
  setWishlistItems:(s,a)=>{ s.wishlistItems=a.payload||[]; },
  addWishlistItem:(s,a)=>{ if(!s.wishlistItems.some(x=>x.productId?._id===a.payload.productId?._id)) s.wishlistItems.unshift(a.payload); },
  removeWishlistItemByProductId:(s,a)=>{ s.wishlistItems=s.wishlistItems.filter(x=>x.productId?._id!==a.payload); },
}});
export const{setWishlistItems,addWishlistItem,removeWishlistItemByProductId}=wishlistSlice.actions;
export default wishlistSlice.reducer;
