"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

// One shared connection per browser tab, reused across every component
// that calls this hook, rather than opening a new socket per component.
let sharedSocket = null;

// Defaults to same-origin (this app's own server.js). Set
// NEXT_PUBLIC_SOCKET_URL if the realtime layer runs as a separate
// service on the VPS while the storefront itself stays on Vercel — see
// the deployment note at the top of server.js.
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!sharedSocket) {
      sharedSocket = io(SOCKET_URL, {
        path: "/socket.io",
        withCredentials: true, // sends the httpOnly accessToken cookie automatically
        transports: ["websocket", "polling"],
      });
    }
    socketRef.current = sharedSocket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    sharedSocket.on("connect", onConnect);
    sharedSocket.on("disconnect", onDisconnect);
    setConnected(sharedSocket.connected);

    return () => {
      sharedSocket?.off("connect", onConnect);
      sharedSocket?.off("disconnect", onDisconnect);
    };
  }, []);

  return { socket: socketRef.current, connected };
}
