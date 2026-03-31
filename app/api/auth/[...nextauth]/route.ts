import NextAuth, { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import CredentialsProvider from "next-auth/providers/credentials";
import { createPrivateKey, sign, timingSafeEqual } from "crypto";
import { consumeMobileAuthTransfer } from "@/lib/server/mobile-auth-transfer";
import { getUserAuthSnapshot, getUserProfile, upsertUserFromOAuth } from "@/lib/server/user-profile";

function normalizeImageUrl(url: string | null | undefined) {
    if (!url) return null;
    const trimmed = String(url).trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`;
    return trimmed;
}

const APPLE_AUDIENCE = "https://appleid.apple.com";
const APPLE_SECRET_TTL_SECONDS = 60 * 60 * 24 * 150; // 150 days
let cachedAppleClientSecret: { token: string; exp: number; fingerprint: string } | null = null;

function toBase64Url(input: string | Buffer) {
    const raw = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
    return raw.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function getAppleClientSecret() {
    const fromEnv = process.env.APPLE_CLIENT_SECRET?.trim();
    if (fromEnv) return fromEnv;

    const clientId = process.env.APPLE_CLIENT_ID?.trim();
    const teamId = process.env.APPLE_TEAM_ID?.trim();
    const keyId = process.env.APPLE_KEY_ID?.trim();
    const privateKeyRaw = process.env.APPLE_PRIVATE_KEY?.trim();
    if (!clientId || !teamId || !keyId || !privateKeyRaw) return "";

    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
    const now = Math.floor(Date.now() / 1000);
    const exp = now + APPLE_SECRET_TTL_SECONDS;
    const fingerprint = `${clientId}:${teamId}:${keyId}`;

    if (cachedAppleClientSecret && cachedAppleClientSecret.fingerprint === fingerprint && cachedAppleClientSecret.exp > now + 300) {
        return cachedAppleClientSecret.token;
    }

    try {
        const header = {
            alg: "ES256",
            kid: keyId,
            typ: "JWT",
        };
        const payload = {
            iss: teamId,
            iat: now,
            exp,
            aud: APPLE_AUDIENCE,
            sub: clientId,
        };
        const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
        const signature = sign("sha256", Buffer.from(signingInput), {
            key: createPrivateKey(privateKey),
            dsaEncoding: "ieee-p1363",
        });
        const token = `${signingInput}.${toBase64Url(signature)}`;
        cachedAppleClientSecret = { token, exp, fingerprint };
        return token;
    } catch (error) {
        console.error("[auth] invalid APPLE_PRIVATE_KEY or Apple client secret generation failed", error);
        return "";
    }
}

function getAppleAuthProvider() {
    const clientId = process.env.APPLE_CLIENT_ID?.trim();
    const clientSecret = getAppleClientSecret();
    if (!clientId || !clientSecret) return null;
    return AppleProvider({
        clientId,
        clientSecret,
    });
}

const appleAuthProvider = getAppleAuthProvider();

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            id: "local-password",
            name: "LocalPassword",
            credentials: {
                userId: { label: "ID", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                const configuredId = (process.env.BOGOPA_LOCAL_LOGIN_ID || "bogopa").trim();
                const configuredPassword =
                    process.env.BOGOPA_LOCAL_LOGIN_PASSWORD || "B0g0pa!2026#X9v@M4q$T7n%K2r^L8p*F5s_Z1w";
                const inputId = typeof credentials?.userId === "string" ? credentials.userId.trim() : "";
                const inputPassword = typeof credentials?.password === "string" ? credentials.password : "";

                if (!inputId || !inputPassword || inputId !== configuredId) return null;

                const a = Buffer.from(inputPassword);
                const b = Buffer.from(configuredPassword);
                const passwordMatches = a.length === b.length && timingSafeEqual(a, b);
                if (!passwordMatches) return null;

                return {
                    id: configuredId,
                    name: configuredId,
                    email: null,
                    image: null,
                    profileCompleted: false,
                };
            },
        }),
        KakaoProvider({
            clientId: process.env.KAKAO_CLIENT_ID || "",
            clientSecret: process.env.KAKAO_CLIENT_SECRET || "", // Not strictly required for Kakao if configured appropriately, but NextAuth accepts it. If it fails, we will need to set a dummy secret or enable it on Kakao Developers. Actually Kakao allows empty secret by default.
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        }),
        ...(appleAuthProvider ? [appleAuthProvider] : []),
        CredentialsProvider({
            id: "mobile-token",
            name: "MobileToken",
            credentials: {
                token: { label: "Transfer Token", type: "text" },
            },
            async authorize(credentials) {
                const transferToken = typeof credentials?.token === "string" ? credentials.token.trim() : "";
                if (!transferToken) return null;

                const consumed = await consumeMobileAuthTransfer(transferToken);
                if (!consumed) return null;

                const [snapshot, profile] = await Promise.all([
                    getUserAuthSnapshot(consumed.userId),
                    getUserProfile(consumed.userId).catch(() => null),
                ]);

                if (!snapshot) return null;

                return {
                    id: snapshot.userId,
                    name: snapshot.name,
                    email: snapshot.email,
                    image: normalizeImageUrl(snapshot.image),
                    profileCompleted: Boolean(profile?.profileCompleted),
                };
            },
        }),
    ],
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async signIn({ user, account }: any) {
            if (!account || !user) return true;
            if (account.provider === "mobile-token") return true;

            try {
                const provider = account.provider || "kakao";
                const id =
                    account.provider === "local-password"
                        ? (typeof user.id === "string" ? user.id : "")
                        : (account.providerAccountId || "");
                if (!id) return true;
                const email = user.email || null;
                const name = user.name || "사용자";
                const image = normalizeImageUrl(user.image || null);

                const upserted = await upsertUserFromOAuth({
                    userId: id,
                    provider,
                    email,
                    name,
                    image,
                });
                if (upserted?.image) {
                    user.image = upserted.image;
                }
            } catch (error) {
                console.error("Failed to save user to db during signIn callback:", error);
            }
            return true;
        },
        async jwt({ token, account, user }: any) {
            if (account?.provider === "mobile-token" && user) {
                token.providerAccountId = user.id;
                token.provider = "mobile-token";
                token.profileCompleted = Boolean(user.profileCompleted);
                token.name = user.name ?? token.name;
                token.email = user.email ?? token.email;
                token.picture = normalizeImageUrl(user.image ?? token.picture);
                return token;
            }

            if (account) {
                token.accessToken = account.access_token;
                token.providerAccountId = account.providerAccountId || user?.id || token.providerAccountId;
                token.provider = account.provider;
                token.name = user?.name ?? token.name;
                token.email = user?.email ?? token.email;
                token.picture = normalizeImageUrl(user?.image ?? token.picture);
                try {
                    const profile = await getUserProfile(account.providerAccountId);
                    token.profileCompleted = Boolean(profile.profileCompleted);
                } catch {
                    token.profileCompleted = false;
                }
                try {
                    const snapshot = await getUserAuthSnapshot(account.providerAccountId);
                    if (snapshot?.image) {
                        token.picture = normalizeImageUrl(snapshot.image);
                    }
                } catch {
                    // keep current token picture
                }
            }
            return token;
        },
        async session({ session, token }: any) {
            // Send properties to the client
            session.user = session.user || {};
            session.user.id = token.providerAccountId;
            session.user.provider = typeof token.provider === "string" ? token.provider : undefined;
            session.user.profileCompleted = Boolean(token.profileCompleted);
            session.user.name = typeof token.name === "string" ? token.name : session.user.name;
            session.user.email = typeof token.email === "string" ? token.email : session.user.email;
            session.user.image = normalizeImageUrl(token.picture ?? session.user.image);
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

            // Preserve mobile OAuth handoff pages for app deep-link login.
            if (target.pathname.startsWith("/auth/mobile/")) {
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
