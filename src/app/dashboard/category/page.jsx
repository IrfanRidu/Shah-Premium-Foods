"use client";
import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useForm } from "react-hook-form";
import { FaEdit, FaTrash, FaPlus } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { setAllCategory } from "@/store/productSlice";
import { axiosToastError, uploadImage } from "@/lib/utils";
import { useGlobalContext } from "@/providers/GlobalProvider";
import ConfirmBox from "@/components/ConfirmBox";
import toast from "react-hot-toast";

function CategoryModal({ defaultValues, onClose }) {
  const dispatch = useDispatch();
  const { fetchCategories } = useGlobalContext();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ defaultValues });
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
        const r = await Axios({ ...api.updateCategory, data: { ...payload, _id: defaultValues._id } });
        if (r.data?.success) { toast.success("Category updated"); await fetchCategories(); onClose(); }
      } else {
        const r = await Axios({ ...api.addCategory, data: payload });
        if (r.data?.success) { toast.success("Category added"); await fetchCategories(); onClose(); }
      }
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-bold mb-4">{isEdit ? "Edit" : "Add"} Category</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Name</label>
            <input {...register("name", { required: "Name required" })} className="input-field" placeholder="e.g. Beverages" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Image</label>
            <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-theme rounded-xl cursor-pointer hover:border-theme-primary transition-colors overflow-hidden">
              {preview
                ? <img src={preview} alt="preview" className="h-full w-full object-contain" />
                : <span className="text-sm text-theme-muted">Click to upload image</span>
              }
              <input type="file" accept="image/*" onChange={handleImg} className="hidden" />
            </label>
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

export default function AdminCategoryPage() {
  const categories = useSelector((s) => s.product.allCategory);
  const { fetchCategories } = useGlobalContext();
  const [modal,   setModal]   = useState(null); // null | "add" | category object
  const [deleting,setDeleting]= useState(null);

  const handleDelete = async () => {
    try {
      await Axios({ ...api.deleteCategory, data: { _id: deleting } });
      toast.success("Category deleted"); setDeleting(null); await fetchCategories();
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-heading text-2xl">Categories</h1>
        <button onClick={() => setModal("add")} className="btn-primary flex items-center gap-2 px-4 py-2">
          <FaPlus size={12} /> Add Category
        </button>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Image</th>
              <th>Name</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr><td colSpan={3} className="text-center py-10 text-theme-muted">No categories yet</td></tr>
            )}
            {categories.map((cat) => (
              <tr key={cat._id}>
                <td>{cat.image && <img src={cat.image} alt={cat.name} className="h-10 w-10 rounded-lg object-cover" />}</td>
                <td className="font-medium">{cat.name}</td>
                <td className="text-right">
                  <div className="action-group justify-end">
                    <button onClick={() => setModal(cat)} className="icon-btn"><FaEdit size={13}/></button>
                    <button onClick={() => setDeleting(cat._id)} className="icon-btn icon-btn-danger"><FaTrash size={13}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <CategoryModal defaultValues={modal === "add" ? null : modal} onClose={() => setModal(null)} />}
      {deleting && (
        <ConfirmBox title="Delete category?" message="This will also affect linked products." danger confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}
