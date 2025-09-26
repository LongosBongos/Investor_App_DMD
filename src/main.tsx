// src/main.tsx
import { Buffer } from "buffer";
if (typeof window !== "undefined" && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App"; // automatisch App.tsx genommen
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root-Element nicht gefunden");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
