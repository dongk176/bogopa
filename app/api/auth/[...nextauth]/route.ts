import NextAuth, { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import GoogleProvider from "next-auth/providers/google";
import { getDbPool } from "@/lib/server/db";

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
                const pool = getDbPool();
                const provider = account.provider || "kakao";
                const id = account.providerAccountId;
                const email = user.email || null;
                const name = user.name || "사용자";
                const image = user.image || null;

                // Upsert to Postgres
                await pool.query(
                    `
                    INSERT INTO bogopa."users" ("id", "name", "email", "image", "provider", "updated_at")
                    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                    ON CONFLICT ("id") DO UPDATE
                    SET "name" = EXCLUDED.name,
                        "email" = EXCLUDED.email,
                        "image" = EXCLUDED.image,
                        "updated_at" = CURRENT_TIMESTAMP;
                    `,
                    [id, name, email, image, provider]
                );
            } catch (error) {
                console.error("Failed to save user to db during signIn callback:", error);
            }
            return true;
        },
        async jwt({ token, account }: any) {
            if (account) {
                token.accessToken = account.access_token;
                token.providerAccountId = account.providerAccountId;
            }
            return token;
        },
        async session({ session, token }: any) {
            // Send properties to the client
            session.user = session.user || {};
            session.user.id = token.providerAccountId;
            return session;
        },
    },
    pages: {
        signIn: "/", // We will trigger login straight from the homepage
    }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
