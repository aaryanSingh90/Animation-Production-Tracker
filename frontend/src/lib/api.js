import axios from "axios";
import { useAuthStore } from "../store/authStore";

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
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json"
  }
});

api.interceptors.request.use(
  (config) => {
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
