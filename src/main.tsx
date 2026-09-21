import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { consumeBackendSessionFromUrl } from "./lib/oauth-backend-client";
import "./styles.css";

// OAuth returns an opaque session in the URL hash. Consume and replace that
// hash before TanStack Router creates its hash history, otherwise the router
// interprets "oauth_session=..." as an application route and renders 404.
consumeBackendSessionFromUrl();

const root = document.getElementById("root");

if (!root) throw new Error("HabitQuest root element was not found.");

const { router } = await import("./router");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
