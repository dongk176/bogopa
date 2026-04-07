import { withAuth } from "next-auth/middleware";

export default withAuth({
    pages: {
        signIn: "/", // 로그인 안되어 있으면 무조건 홈으로 튕기게 함
    },
    callbacks: {
        authorized: ({ req, token }) => {
            if (!token) return false;
            void req;
            return true;
        },
    },
});

export const config = {
    matcher: [
        // Protect every app page except the home login entry ("/"),
        // public legal pages, API routes, Next internals, and static asset file paths.
        "/((?!$|login$|legal|api|auth|_next/static|_next/image|.*\\..*).*)",
    ],
};
