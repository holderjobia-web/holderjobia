/**
 * Axios do front PORTAL (cliente).
 * Token JWT (JWT_SECRET) guardado em localStorage `portal_token` e em cookie
 * `token` (lido pelo middleware.ts para proteger as rotas /portal/*).
 */
import axios from "axios";
import { resolveApiBaseUrl } from "./api-base";

const BASE_URL = resolveApiBaseUrl();

export function savePortalToken(token: string, user: object) {
  localStorage.setItem("portal_token", token);
  localStorage.setItem("portal_user", JSON.stringify(user));
  document.cookie = `token=${token}; path=/; SameSite=Lax`;
}

export function clearPortalToken() {
  localStorage.removeItem("portal_token");
  localStorage.removeItem("portal_user");
  document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

export const portalApi = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

portalApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("portal_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

portalApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      const onLogin = window.location.pathname.includes("/login");
      if (!onLogin) {
        clearPortalToken();
        window.location.href = "/portal/login";
      }
    }
    return Promise.reject(err);
  }
);
