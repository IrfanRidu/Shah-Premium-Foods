import { createSlice } from "@reduxjs/toolkit";
const initial = { _id:"",name:"",email:"",avatar:"",mobile:"",verify_email:false,last_login_date:"",status:"",address_details:[],shopping_cart:[],orderHistory:[],role:"" };
const userSlice = createSlice({ name:"user", initialState:initial, reducers:{
  setUserDetails:(s,a)=>{ const p=a.payload||{}; Object.assign(s,{...initial,...p}); },
  updatedAvatar:(s,a)=>{ s.avatar=a.payload; },
  logout:(s)=>{ Object.assign(s,initial); },
}});
export const{setUserDetails,updatedAvatar,logout}=userSlice.actions;
export default userSlice.reducer;
