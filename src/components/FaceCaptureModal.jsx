"use client";
import { useEffect, useRef, useState } from "react";
import { FaCamera, FaTimes } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";

// Advanced HRMS Features spec: "Employee face enrollment... Face
// verification... Confidence score... Attendance only after successful
// verification." Enrollment (HR registers a face) and verification
// (attendance check-in/out) are two different spec actions that share
// the exact same underlying mechanics — get a clean descriptor from a
// live camera via face-api.js — which is why this is ONE shared
// component parameterized by `purpose` rather than two near-duplicate
// ones living in different pages.
//
// This is genuinely the least-verifiable piece of this entire multi-
// session build: it needs a real camera, a real face, and face-api.js's
// model files actually present at /public/models on the deployment
// server (a one-time download this sandbox has no network access to
// perform) to do anything at all. Written carefully against face-api.js
//'s documented, stable API (dynamic import so the ~large TensorFlow.js
// dependency it pulls in only loads for someone who actually opens this
// modal, not on every page load) and handles every failure mode it
// reasonably can — no camera permission, no camera hardware, missing
// model files — with a clear message, never a silent dead end.
export default function FaceCaptureModal({ purpose, employeeId, title, onClose, onDone }) {
  // purpose: "enroll" | "checkin" | "checkout"
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [phase, setPhase] = useState("loading"); // loading | ready | detecting | error
  const [errorMessage, setErrorMessage] = useState("");
  const faceapiRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const faceapi = await import("face-api.js");
        if (cancelled) return;
        faceapiRef.current = faceapi;

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
          faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
        ]);
        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        const isCameraDenied = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
        const isNoCamera = err.name === "NotFoundError" || err.name === "DevicesNotFoundError";
        setErrorMessage(
          isCameraDenied ? "Camera access was denied. Allow camera access in your browser and try again."
          : isNoCamera ? "No camera was found on this device."
          : "Facial recognition isn't available right now — the model files may not be set up on this server yet."
        );
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = async () => {
    const faceapi = faceapiRef.current;
    if (!faceapi || !videoRef.current) return;
    try {
      setPhase("detecting");
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        toast.error("No face detected — center your face in frame and try again.");
        setPhase("ready");
        return;
      }

      const descriptor = Array.from(detection.descriptor); // Float32Array -> plain array, so it actually serializes to real numbers over JSON rather than an empty object
      const r = purpose === "enroll"
        ? await Axios({ ...api.enrollFace, data: { employeeId, descriptor } })
        : await Axios({ ...api.verifyFace, data: { employeeId, descriptor, action: purpose } });

      if (r.data?.success) {
        toast.success(r.data.isDemoAction ? r.data.message : (r.data.message || "Done"));
        streamRef.current?.getTracks().forEach((t) => t.stop());
        if (!r.data.isDemoAction) onDone?.(r.data.data);
        onClose();
      }
    } catch (err) {
      axiosToastError(err);
      setPhase("ready");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="icon-btn"><FaTimes size={14} /></button>
        </div>

        {phase === "error" ? (
          <p className="text-sm text-theme-muted py-6 text-center">{errorMessage}</p>
        ) : (
          <>
            <div className="rounded-xl overflow-hidden bg-black aspect-square mb-4 relative">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              {phase === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-black/40">Loading camera…</div>
              )}
            </div>
            <p className="text-xs text-theme-muted text-center mb-4">Center your face in frame, then capture.</p>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline px-4 py-2 text-sm">Cancel</button>
          {phase !== "error" && (
            <button onClick={capture} disabled={phase !== "ready"} className="btn-primary px-4 py-2 text-sm disabled:opacity-60 flex items-center gap-2">
              <FaCamera size={12} /> {phase === "detecting" ? "Verifying…" : "Capture"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
