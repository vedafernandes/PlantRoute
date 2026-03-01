import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// For local dev, set NEXTAUTH_URL=http://localhost:3000 in .env.local to avoid CLIENT_FETCH_ERROR.

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        const u = session.user as { id?: string; name?: string | null; email?: string | null; image?: string | null };
        u.id = user.id;
        u.name = user.name ?? session.user.name ?? null;
        u.email = user.email ?? session.user.email ?? null;
        u.image = user.image ?? session.user.image ?? null;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  logger: {
    error(code: string, metadata?: Error | { error?: Error; [key: string]: unknown }) {
      if (code === "JWT_SESSION_ERROR") return;
      console.error("[next-auth]", code, metadata);
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
