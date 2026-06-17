import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Protección de rutas: sin cookie de sesión → /login. La verificación
// completa (y el RBAC) ocurre en la capa de servicios; esto es el primer filtro.
export function middleware(req: NextRequest) {
  const hasSession = getSessionCookie(req) != null;
  const isLogin = req.nextUrl.pathname === "/login";

  if (!hasSession && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (hasSession && isLogin) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Excluye API, estáticos y archivos con extensión.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
