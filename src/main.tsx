// src/main.tsx

import { Buffer } from "buffer";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

declare global {
  interface Window {
    Buffer?: typeof Buffer;
  }
}

if (typeof globalThis !== "undefined" && !("Buffer" in globalThis)) {
  Object.defineProperty(globalThis, "Buffer", {
    value: Buffer,
    writable: false,
    configurable: true,
  });
}

if (typeof window !== "undefined" && !window.Buffer) {
  window.Buffer = Buffer;
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root-Element #root wurde nicht gefunden.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);