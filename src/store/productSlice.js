import { createSlice } from "@reduxjs/toolkit";
const productSlice = createSlice({ name:"product", initialState:{allCategory:[],allSubCategory:[],loadingCategory:false}, reducers:{
  setAllCategory:(s,a)=>{ s.allCategory=a.payload||[]; },
  setAllSubCategory:(s,a)=>{ s.allSubCategory=a.payload||[]; },
  setLoadingCategory:(s,a)=>{ s.loadingCategory=a.payload; },
}});
export const{setAllCategory,setAllSubCategory,setLoadingCategory}=productSlice.actions;
export default productSlice.reducer;
