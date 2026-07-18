import { createSlice } from "@reduxjs/toolkit";
const addressSlice = createSlice({ name:"address", initialState:{addressList:[]}, reducers:{
  setAddressList:(s,a)=>{ s.addressList=a.payload||[]; },
  addAddress:(s,a)=>{ s.addressList.push(a.payload); },
  updateAddress:(s,a)=>{ const i=s.addressList.findIndex(x=>x._id===a.payload._id); if(i!==-1) s.addressList[i]=a.payload; },
  removeAddress:(s,a)=>{ s.addressList=s.addressList.filter(x=>x._id!==a.payload); },
}});
export const{setAddressList,addAddress,updateAddress,removeAddress}=addressSlice.actions;
export default addressSlice.reducer;
