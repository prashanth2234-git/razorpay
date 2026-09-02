import { UserRole } from "@prisma/client";
import { DefaultSession } from "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id?: string;
    role?: UserRole;
    merchantId?: string;
    merchantName?: string;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      merchantId: string;
      merchantName: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    merchantId?: string;
    merchantName?: string;
  }
}
