"use client";
import { Provider } from "react-redux";
import { Toaster } from "react-hot-toast";
import { store } from "@/store/store";
import GlobalProvider from "./GlobalProvider";
import DemoModeNotice from "@/components/DemoModeNotice";
import CompareBar from "@/components/CompareBar";
import CartDrawer from "@/components/CartDrawer";
import WishlistDrawer from "@/components/WishlistDrawer";

export default function Providers({ children, hasSessionHint = false }) {
  return (
    <Provider store={store}>
      <GlobalProvider hasSessionHint={hasSessionHint}>
        {children}
        <DemoModeNotice />
        <CompareBar />
        {/* Session 5 — Cart/Wishlist slide-out drawers. Mounted once here,
            same established pattern as DemoModeNotice/CompareBar above:
            both read their "am I open" state from the new `ui` Redux
            slice (uiSlice.js) so ANY component anywhere (Header's icons,
            the account dropdown, mobile menu) can open either one just by
            dispatching an action, without needing to be an ancestor of
            whichever page happens to be showing. */}
        <CartDrawer />
        <WishlistDrawer />
        <Toaster
          position="top-center"
          containerStyle={{
            // Mobile UI pass: top-right corner toasts are a desktop
            // pattern — cramped and easy to miss on a narrow phone
            // screen, and this site's mobile header is a sticky/fixed
            // element a corner toast could visually collide with.
            // top-center with an offset that clears the header (the
            // compact mobile header lands around ~56-60px tall after
            // this pass's changes) reads more like how mobile apps
            // typically surface toasts.
            top: 68,
          }}
          toastOptions={{
            style: {
              background: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: "0.75rem",
              fontSize: "0.875rem",
              maxWidth: "min(22rem, calc(100vw - 1.5rem))",
              padding: "0.75rem 1rem",
            },
          }}
        />
      </GlobalProvider>
    </Provider>
  );
}
