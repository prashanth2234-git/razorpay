import type { NextAuthConfig } from "next-auth";
import { UserRole } from "@/types/client";

interface ExtendedUser {
  id?: string;
  role?: UserRole;
  merchantId?: string;
  merchantName?: string;
}

/**
 * Edge-compatible NextAuth configuration.
 *
 * This configuration is loaded by Edge middleware and contains NO Node.js/Prisma/database dependencies.
 */
export const authConfig = {
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const extUser = user as ExtendedUser;
        token.id = extUser.id;
        token.role = extUser.role;
        token.merchantId = extUser.merchantId;
        token.merchantName = extUser.merchantName;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.merchantId = token.merchantId as string;
        session.user.merchantName = token.merchantName as string;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isLoginPage = nextUrl.pathname.startsWith("/login");

      if (isDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect unauthenticated users to login
      }
      if (isLoginPage && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.AUTH_SECRET || "dev-razorrecover-insecure-secret-key-32chars",
} satisfies NextAuthConfig;
