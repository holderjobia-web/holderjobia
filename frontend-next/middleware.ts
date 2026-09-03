import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware de rota (roda no servidor, antes do JS do cliente).
 * Protege os dois fronts lendo o token do cookie:
 *   - /admin/*  → cookie `admin_token` (senão redireciona para /admin/login)
 *   - /portal/* → cookie `token`       (senão redireciona para /portal/login)
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Front ADMIN (super admin do SaaS)
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = request.cookies.get("admin_token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // Front PORTAL (cliente). A tela de troca de senha é acessível logada.
  if (
    pathname.startsWith("/portal") &&
    pathname !== "/portal/login" &&
    pathname !== "/portal/alterar-senha"
  ) {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/portal/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*"],
};
