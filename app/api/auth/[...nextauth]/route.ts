import NextAuth, { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import GoogleProvider from "next-auth/providers/google";
import { getUserProfile, upsertUserFromOAuth } from "@/lib/server/user-profile";

export const authOptions: NextAuthOptions = {
    providers: [
        KakaoProvider({
            clientId: process.env.KAKAO_CLIENT_ID || "",
            clientSecret: process.env.KAKAO_CLIENT_SECRET || "", // Not strictly required for Kakao if configured appropriately, but NextAuth accepts it. If it fails, we will need to set a dummy secret or enable it on Kakao Developers. Actually Kakao allows empty secret by default.
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        }),
    ],
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async signIn({ user, account }: any) {
            if (!account || !user) return true;

            try {
                const provider = account.provider || "kakao";
                const id = account.providerAccountId;
                const email = user.email || null;
                const name = user.name || "사용자";
                const image = user.image || null;

                await upsertUserFromOAuth({
                    userId: id,
                    provider,
                    email,
                    name,
                    image,
                });
            } catch (error) {
                console.error("Failed to save user to db during signIn callback:", error);
            }
            return true;
        },
        async jwt({ token, account }: any) {
            if (account) {
                token.accessToken = account.access_token;
                token.providerAccountId = account.providerAccountId;
                try {
                    const profile = await getUserProfile(account.providerAccountId);
                    token.profileCompleted = Boolean(profile.profileCompleted);
                } catch {
                    token.profileCompleted = false;
                }
            }
            return token;
        },
        async session({ session, token }: any) {
            // Send properties to the client
            session.user = session.user || {};
            session.user.id = token.providerAccountId;
            session.user.profileCompleted = Boolean(token.profileCompleted);
            return session;
        },
        async redirect({ url, baseUrl }: any) {
            const target = url.startsWith("/") ? new URL(url, baseUrl) : new URL(url);
            if (target.origin !== baseUrl) {
                return baseUrl;
            }

            // Keep explicit home/legal redirects as-is (e.g. signOut callbackUrl "/")
            if (target.pathname === "/" || target.pathname.startsWith("/legal")) {
                return target.toString();
            }

            // Preserve explicit auth-entry targets with query (e.g. ?next=/chat).
            if (target.pathname === "/auth/entry") {
                return target.toString();
            }

            // Force every sign-in completion through a single onboarding gate.
            return `${baseUrl}/auth/entry`;
        },
    },
    pages: {
        signIn: "/", // We will trigger login straight from the homepage
    }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
