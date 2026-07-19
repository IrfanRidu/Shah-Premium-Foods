"use client";
import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useForm } from "react-hook-form";
import { FaPlus, FaEdit, FaTrash } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { setAddressList, addAddress, updateAddress, removeAddress } from "@/store/addressSlice";
import { axiosToastError } from "@/lib/utils";
import ConfirmBox from "@/components/ConfirmBox";
import toast from "react-hot-toast";

// Fix (explicit request): a mobile number is no longer required on the
// user's account profile (see dashboard/profile/page.jsx) to place an
// order, but it's still genuinely needed for delivery — the courier needs
// a way to reach whoever's receiving the order. So the requirement now
// lives here instead, on the actual delivery address used for an order,
// where it belongs.
const FIELDS = [
  { name:"address_line", label:"Address Line", required:true },
  { name:"city",         label:"City",         required:true },
  { name:"state",        label:"State (optional)",        required:false },
  { name:"pincode",      label:"Pincode (optional)",      required:false },
  { name:"country",      label:"Country",      required:true },
  { name:"mobile",       label:"Mobile (required for delivery)", required:true },
];

function AddressForm({ defaultValues, onSave, onCancel }) {
  const { register, handleSubmit, formState:{errors,isSubmitting} } = useForm({ defaultValues });
  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map(({ name, label, required }) => (
          <div key={name} className={name==="address_line"?"sm:col-span-2":""}>
            <label className="block text-sm font-medium mb-1">{label}</label>
            <input {...register(name, required?{required:`${label} required`}:{})} className="input-field" />
            {errors[name] && <p className="text-xs text-red-500 mt-0.5">{errors[name].message}</p>}
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={isSubmitting} className="btn-primary px-5 py-2">{isSubmitting?"Saving…":"Save"}</button>
        <button type="button" onClick={onCancel} className="btn-outline px-5 py-2">Cancel</button>
      </div>
    </form>
  );
}

export default function AddressPage() {
  const addresses = useSelector((s) => s.address.addressList);
  const dispatch  = useDispatch();
  const [adding,  setAdding]  = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting,setDeleting]= useState(null);

  const handleAdd = async (data) => {
    try {
      const r = await Axios({ ...api.addAddress, data });
      if (r.data?.success) { dispatch(addAddress(r.data.data)); setAdding(false); toast.success("Address added"); }
    } catch (err) { axiosToastError(err); }
  };

  const handleUpdate = async (data) => {
    try {
      const r = await Axios({ ...api.updateAddress, data: { ...data, _id: editing._id } });
      if (r.data?.success) { dispatch(updateAddress(r.data.data)); setEditing(null); toast.success("Address updated"); }
    } catch (err) { axiosToastError(err); }
  };

  const handleDelete = async () => {
    try {
      await Axios({ ...api.deleteAddress, data: { _id: deleting } });
      dispatch(removeAddress(deleting)); setDeleting(null); toast.success("Address removed");
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-heading text-2xl">Addresses</h1>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-primary flex items-center gap-2 px-4 py-2">
            <FaPlus size={12} /> Add Address
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-[var(--color-surface)] border border-theme-primary rounded-2xl p-5 mb-5">
          <h3 className="font-semibold mb-4">New Address</h3>
          <AddressForm onSave={handleAdd} onCancel={() => setAdding(false)} />
        </div>
      )}

      <div className="space-y-4">
        {addresses.map((addr) => (
          <div key={addr._id} className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
            {editing?._id === addr._id ? (
              <AddressForm defaultValues={addr} onSave={handleUpdate} onCancel={() => setEditing(null)} />
            ) : (
              <div className="flex justify-between gap-3">
                <div className="text-sm">
                  <p className="font-semibold">{addr.address_line}</p>
                  <p className="text-theme-muted">{[addr.city,addr.state,addr.pincode,addr.country].filter(Boolean).join(", ")}</p>
                  {addr.mobile && <p className="text-theme-muted">{addr.mobile}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setEditing(addr)} className="icon-btn"><FaEdit size={14}/></button>
                  <button onClick={() => setDeleting(addr._id)} className="icon-btn icon-btn-danger"><FaTrash size={14}/></button>
                </div>
              </div>
            )}
          </div>
        ))}

        {addresses.length === 0 && !adding && (
          <div className="text-center py-10 text-theme-muted text-sm">No addresses saved yet.</div>
        )}
      </div>

      {deleting && (
        <ConfirmBox
          title="Delete address?"
          message="This address will be permanently removed."
          danger
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
