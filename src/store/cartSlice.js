import { createSlice } from "@reduxjs/toolkit";
const cartSlice = createSlice({ name:"cartItem", initialState:{cart:[],loading:false}, reducers:{
  setCartItem:(s,a)=>{ s.cart=a.payload||[]; },
  addItemToCart:(s,a)=>{ s.cart.push(a.payload); },
  updateCartItemQty:(s,a)=>{ const{_id,qty}=a.payload; const i=s.cart.find(c=>c._id===_id); if(i) i.quantity=qty; },
  removeCartItem:(s,a)=>{ s.cart=s.cart.filter(c=>c._id!==a.payload); },
  setLoadingCart:(s,a)=>{ s.loading=a.payload; },
  resetCart:(s)=>{ s.cart=[]; s.loading=false; },
}});
export const{setCartItem,addItemToCart,updateCartItemQty,removeCartItem,setLoadingCart,resetCart}=cartSlice.actions;
export default cartSlice.reducer;
