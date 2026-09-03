/**
 * Axios do front ADMIN (super admin do SaaS holderjob).
 * Token JWT (JWT_ADMIN_SECRET) guardado em localStorage `admin_token` e em
 * cookie `admin_token` (o cookie é lido pelo middleware.ts para proteger rotas).
 */
import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function saveAdminToken(token: string, user: object) {
  localStorage.setItem("admin_token", token);
  localStorage.setItem("admin_user", JSON.stringify(user));
  document.cookie = `admin_token=${token}; path=/; SameSite=Lax`;
}

export function clearAdminToken() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  document.cookie = "admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

export const adminApi = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

adminApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLogin = err.config?.url?.includes("/admin/auth/login");
    if (err.response?.status === 401 && typeof window !== "undefined" && !isLogin) {
      clearAdminToken();
      window.location.href = "/admin/login";
    }
    return Promise.reject(err);
  }
);
