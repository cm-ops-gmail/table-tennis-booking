import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TenMSAuthProvider } from "@tenminuteschool/auth-admin-react";
import App from "./App";
import { auth } from "./lib/auth";
import "./index.css";

// Vite is all client-side, so the "wrap the provider in a 'use client'
// component" dance from the SDK's Next.js README doesn't apply here — we can
// mount TenMSAuthProvider directly. It processes a cross-app `tenms_token`
// handoff on mount, so it sits above the router.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TenMSAuthProvider auth={auth}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </TenMSAuthProvider>
  </React.StrictMode>
);
