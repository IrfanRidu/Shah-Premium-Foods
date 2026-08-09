"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Axios from "@/lib/axios";
import * as sip from "../telephony/sipClient";

// Call state machine this hook exposes: "disconnected" (softphone not
// registered yet) -> "idle" -> "dialing"/"incoming" -> "ringing" ->
// "connected" -> back to "idle".
export function useSipClient() {
  const [phoneState, setPhoneState] = useState("disconnected");
  const [incomingFrom, setIncomingFrom] = useState(null);
  const currentCallLogId = useRef(null);
  // Set once by connect() from /telephony/credentials — reused by
  // makeCall() rather than a second, separately-configured env var that
  // could drift out of sync with the server's ASTERISK_SIP_DOMAIN.
  const sipDomainRef = useRef(null);

  useEffect(() => {
    const unsubscribe = sip.onSipEvent((evt) => {
      if (evt.type === "registered") setPhoneState("idle");
      if (evt.type === "calling") setPhoneState("dialing");
      if (evt.type === "ringing") setPhoneState("ringing");
      if (evt.type === "incoming") { setPhoneState("incoming"); setIncomingFrom(evt.from); }
      if (evt.type === "answered") {
        setPhoneState("connected");
        updateStatusQuiet("on_call");
        if (currentCallLogId.current) {
          Axios.put("/api/callcenter/calls/status", { _id: currentCallLogId.current, status: "answered" }).catch(() => {});
        }
      }
      if (evt.type === "ended") {
        setPhoneState("idle");
        setIncomingFrom(null);
        updateStatusQuiet("available");
        if (currentCallLogId.current) {
          Axios.put("/api/callcenter/calls/status", { _id: currentCallLogId.current, status: "completed" }).catch(() => {});
          currentCallLogId.current = null;
        }
      }
    });
    return unsubscribe;
  }, []);

  // Best-effort agent status flip during calls — never blocks the call
  // itself if this fails (a status-update hiccup shouldn't drop a call).
  const updateStatusQuiet = (status) => {
    Axios.put("/api/callcenter/agent-status/me", { status }).catch(() => {});
  };

  // Explicit "go online" action — deliberately not automatic on page
  // load, so an agent isn't hit with a browser mic-permission prompt
  // just for visiting their dashboard.
  const connect = useCallback(async () => {
    const { data } = await Axios.get("/api/callcenter/telephony/credentials");
    const creds = data?.data;
    if (!creds) throw new Error("No SIP credentials available for this account");
    sipDomainRef.current = creds.sipDomain;
    await sip.initSip(creds);
  }, []);

  const disconnect = useCallback(async () => {
    await sip.teardownSip();
    setPhoneState("disconnected");
  }, []);

  const makeCall = useCallback(async (customerNumber, { orderId, customerName } = {}) => {
    if (phoneState !== "idle") throw new Error(`Cannot start a call while phone is "${phoneState}"`);
    // Log the call first (existing pattern from logCallInitiatedController
    // — this part is always reliable, it's just a DB write) so there's a
    // record even if the SIP invite that follows fails to connect.
    const { data } = await Axios.post("/api/callcenter/calls", { direction: "outbound", customerNumber, orderId, customerName });
    currentCallLogId.current = data?.data?._id || null;

    if (!sipDomainRef.current) throw new Error("Softphone is not connected — call connect() first");
    await sip.makeCall(customerNumber, sipDomainRef.current);
  }, [phoneState]);

  const answerCall = useCallback(() => sip.answerCall(), []);
  const rejectCall = useCallback(async () => {
    await sip.rejectCall();
    if (currentCallLogId.current) {
      await Axios.put("/api/callcenter/calls/status", { _id: currentCallLogId.current, status: "rejected" }).catch(() => {});
      currentCallLogId.current = null;
    }
  }, []);
  const hangupCall = useCallback(() => sip.hangupCall(), []);
  const sendDTMF = useCallback((tone) => sip.sendDTMF(tone), []);
  const setHold = useCallback((hold) => sip.toggleHold(hold), []);

  return { phoneState, incomingFrom, connect, disconnect, makeCall, answerCall, rejectCall, hangupCall, sendDTMF, setHold };
}
