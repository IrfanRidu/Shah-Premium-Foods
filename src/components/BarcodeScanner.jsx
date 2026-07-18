"use client";
import { useRef, useState } from "react";
import { FaBarcode } from "react-icons/fa";

/**
 * USB and Bluetooth barcode scanners are keyboard-emulation devices — they
 * just "type" the code very fast and then send Enter. So a plain focused
 * text input that submits on Enter is all that's needed to support real
 * scanner hardware; no special timing detection required. Works identically
 * with manual typing for testing without a physical scanner.
 */
export default function BarcodeScanner({ onScan, placeholder = "Scan or type a barcode / SKU / order ID…", autoFocus = true }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  const submit = () => {
    const code = value.trim();
    if (!code) return;
    onScan(code);
    setValue("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-2 bg-[var(--color-surface)] border-2 border-theme-primary rounded-xl px-4 py-3">
      <FaBarcode className="text-theme-primary text-xl shrink-0" />
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none text-base font-mono tracking-wide"
      />
      <button onClick={submit} className="btn-primary px-4 py-1.5 text-sm shrink-0">Go</button>
    </div>
  );
}
