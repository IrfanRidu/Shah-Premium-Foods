import { FaBoxOpen } from "react-icons/fa";

export default function NoData({ message = "No data found", description }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <FaBoxOpen size={48} className="text-theme-muted opacity-40" />
      <p className="font-display text-xl font-semibold text-theme-muted">{message}</p>
      {description && <p className="text-sm text-theme-muted max-w-xs">{description}</p>}
    </div>
  );
}
