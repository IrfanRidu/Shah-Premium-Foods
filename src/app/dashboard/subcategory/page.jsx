"use client";
import { useState } from "react";
import { useSelector } from "react-redux";
import { useForm, Controller } from "react-hook-form";
import { FaEdit, FaTrash, FaPlus } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, uploadImage } from "@/lib/utils";
import { useGlobalContext } from "@/providers/GlobalProvider";
import ConfirmBox from "@/components/ConfirmBox";
import toast from "react-hot-toast";

function SubCatModal({ defaultValues, onClose }) {
  const { fetchCategories } = useGlobalContext();
  const categories = useSelector((s) => s.product.allCategory);
  const { register, handleSubmit, control, formState: { isSubmitting } } = useForm({
    defaultValues: defaultValues
      ? { ...defaultValues, category: defaultValues.category?.map((c) => c._id || c) }
      : { category: [] },
  });
  const [preview, setPreview] = useState(defaultValues?.image || "");
  const [imgFile, setImgFile] = useState(null);
  const isEdit = !!defaultValues?._id;

  const handleImg = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setImgFile(f); setPreview(URL.createObjectURL(f));
  };

  const onSubmit = async (data) => {
    try {
      let imageUrl = defaultValues?.image || "";
      if (imgFile) {
        const up = await uploadImage(imgFile, Axios, api);
        imageUrl = up?.data?.url || imageUrl;
      }
      const payload = { ...data, image: imageUrl };
      if (isEdit) {
        const r = await Axios({ ...api.updateSubCategory, data: { ...payload, _id: defaultValues._id } });
        if (r.data?.success) { toast.success("Sub-category updated"); await fetchCategories(); onClose(); }
      } else {
        const r = await Axios({ ...api.addSubCategory, data: payload });
        if (r.data?.success) { toast.success("Sub-category added"); await fetchCategories(); onClose(); }
      }
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-bold mb-4">{isEdit ? "Edit" : "Add"} Sub-Category</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Name</label>
            <input {...register("name", { required: "Name required" })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Image</label>
            <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-theme rounded-xl cursor-pointer hover:border-theme-primary transition-colors overflow-hidden">
              {preview ? <img src={preview} alt="preview" className="h-full w-full object-contain" /> : <span className="text-sm text-theme-muted">Click to upload</span>}
              <input type="file" accept="image/*" onChange={handleImg} className="hidden" />
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Parent Categories</label>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
              <Controller name="category" control={control} render={({ field }) => (
                <>
                  {categories.map((cat) => {
                    const checked = (field.value || []).includes(cat._id);
                    return (
                      <label key={cat._id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-all ${checked ? "border-theme-primary bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]" : "border-theme"}`}>
                        <input type="checkbox" checked={checked} onChange={(e) => {
                          const next = e.target.checked ? [...(field.value||[]), cat._id] : (field.value||[]).filter((id)=>id!==cat._id);
                          field.onChange(next);
                        }} className="accent-[var(--color-primary)]" />
                        {cat.image && <img src={cat.image} alt="" className="h-5 w-5 rounded object-cover" />}
                        {cat.name}
                      </label>
                    );
                  })}
                </>
              )} />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="btn-outline px-5 py-2">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary px-5 py-2">{isSubmitting ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminSubCategoryPage() {
  const subCategories = useSelector((s) => s.product.allSubCategory);
  const { fetchCategories } = useGlobalContext();
  const [modal,    setModal]    = useState(null);
  const [deleting, setDeleting] = useState(null);

  const handleDelete = async () => {
    try {
      await Axios({ ...api.deleteSubCategory, data: { _id: deleting } });
      toast.success("Sub-category deleted"); setDeleting(null); await fetchCategories();
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-heading text-2xl">Sub-Categories</h1>
        <button onClick={() => setModal("add")} className="btn-primary flex items-center gap-2 px-4 py-2">
          <FaPlus size={12} /> Add Sub-Category
        </button>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Image</th><th>Name</th><th>Categories</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {subCategories.length === 0 && (
              <tr><td colSpan={4} className="text-center py-10 text-theme-muted">No sub-categories yet</td></tr>
            )}
            {subCategories.map((sub) => (
              <tr key={sub._id}>
                <td>{sub.image && <img src={sub.image} alt={sub.name} className="h-10 w-10 rounded-lg object-cover" />}</td>
                <td className="font-medium">{sub.name}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {sub.category?.map((c) => (
                      <span key={c._id||c} className="badge text-[10px]">{c.name||c}</span>
                    ))}
                  </div>
                </td>
                <td className="text-right">
                  <div className="action-group justify-end">
                    <button onClick={() => setModal(sub)} className="icon-btn"><FaEdit size={13}/></button>
                    <button onClick={() => setDeleting(sub._id)} className="icon-btn icon-btn-danger"><FaTrash size={13}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <SubCatModal defaultValues={modal === "add" ? null : modal} onClose={() => setModal(null)} />}
      {deleting && <ConfirmBox title="Delete sub-category?" danger confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}
