import axios from "axios";
import { useAuthStore } from "../store/authStore";

const RAW_API_BASE_URL = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const API_BASE_URL = RAW_API_BASE_URL
  ? /\/api$/i.test(RAW_API_BASE_URL)
    ? RAW_API_BASE_URL
    : `${RAW_API_BASE_URL}/api`
  : "";

console.log("VITE_API_URL:", import.meta.env.VITE_API_URL);
console.log("normalized API_BASE_URL:", API_BASE_URL);

if (!API_BASE_URL) {
  console.error("Missing VITE_API_URL. Set it in your Vercel environment variables.");
} else if (!/\/api$/i.test(RAW_API_BASE_URL || "")) {
  console.warn("VITE_API_URL is missing '/api'. Auto-corrected at runtime.");
}

function readTokenFromStorage() {
  try {
    const raw = window.localStorage.getItem("animation-tracker-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.token || null;
  } catch {
    return null;
  }
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json"
  }
});

console.log("api.defaults.baseURL:", api.defaults.baseURL);

api.interceptors.request.use(
  (config) => {
    if (!API_BASE_URL) {
      const configError = new Error("Missing VITE_API_URL configuration");
      configError.userMessage = "App configuration error: API URL is missing.";
      return Promise.reject(configError);
    }

    // Defensive fix: guarantee requests always target the `/api` namespace.
    if (typeof config.baseURL === "string" && !/\/api$/i.test(config.baseURL.replace(/\/+$/, ""))) {
      config.baseURL = `${config.baseURL.replace(/\/+$/, "")}/api`;
    }

    // If any call accidentally uses `/api/...`, strip duplicate prefix because baseURL already contains `/api`.
    if (typeof config.url === "string" && config.url.startsWith("/api/")) {
      config.url = config.url.slice(4);
    }

    const inMemoryToken = useAuthStore.getState().token;
    const token = inMemoryToken || readTokenFromStorage();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      error.userMessage = "Network error. Please check your internet connection and retry.";
      return Promise.reject(error);
    }

    if (error.response.status === 401) {
      useAuthStore.getState().logout();

      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }

      error.userMessage = "Session expired. Please sign in again.";
      return Promise.reject(error);
    }

    error.userMessage = error.response.data?.message || "Request failed. Please try again.";
    return Promise.reject(error);
  }
);

export default api;
