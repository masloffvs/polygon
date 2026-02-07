/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// Some browsers dispatch specific error events for this
window.addEventListener("error", (e) => {
	if (
		e.message ===
			"ResizeObserver loop completed with undelivered notifications." ||
		e.message === "ResizeObserver loop limit exceeded"
	) {
		e.stopImmediatePropagation();
		e.preventDefault();
		return false;
	}
});

// Also patch console.error because some frameworks log it there
const originalConsoleError = console.error;
console.error = (...args) => {
	if (
		typeof args[0] === "string" &&
		(args[0].includes(
			"ResizeObserver loop completed with undelivered notifications",
		) ||
			args[0].includes("ResizeObserver loop limit exceeded"))
	) {
		return;
	}
	originalConsoleError(...args);
};

function start() {
	const root = createRoot(document.getElementById("root")!);
	root.render(<App />);
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", start);
} else {
	start();
}
