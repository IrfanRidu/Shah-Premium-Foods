import { createSlice } from "@reduxjs/toolkit";
const orderSlice = createSlice({ name:"order", initialState:{order:[],loading:false}, reducers:{
  setOrder:(s,a)=>{ s.order=a.payload||[]; },
  addOrder:(s,a)=>{ s.order.unshift(a.payload); },
  setOrderLoading:(s,a)=>{ s.loading=a.payload; },
}});
export const{setOrder,addOrder,setOrderLoading}=orderSlice.actions;
export default orderSlice.reducer;
