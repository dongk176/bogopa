import NextAuth from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";

const handler = NextAuth({
    providers: [
        KakaoProvider({
            clientId: process.env.KAKAO_CLIENT_ID || "",
            clientSecret: "", // Not strictly required for Kakao if configured appropriately, but NextAuth accepts it. If it fails, we will need to set a dummy secret or enable it on Kakao Developers. Actually Kakao allows empty secret by default.
        }),
    ],
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async jwt({ token, account }: any) {
            if (account) {
                token.accessToken = account.access_token;
            }
            return token;
        },
        async session({ session, token }: any) {
            // Send properties to the client
            session.user = session.user || {};
            return session;
        },
    },
    pages: {
        signIn: "/", // We will trigger login straight from the homepage
    }
});

export { handler as GET, handler as POST };
