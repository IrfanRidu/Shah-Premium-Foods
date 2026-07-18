"use client";
import { Provider } from "react-redux";
import { Toaster } from "react-hot-toast";
import { store } from "@/store/store";
import GlobalProvider from "./GlobalProvider";

export default function Providers({ children }) {
  return (
    <Provider store={store}>
      <GlobalProvider>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: "0.75rem",
              fontSize: "0.875rem",
            },
          }}
        />
      </GlobalProvider>
    </Provider>
  );
}
