import { withAuth } from "next-auth/middleware";

export default withAuth({
    pages: {
        signIn: "/", // 로그인 안되어 있으면 무조건 홈으로 튕기게 함
    },
});

export const config = {
    matcher: [
        "/step-1",
        "/step-2",
        "/step-3",
        "/step-4",
        "/step-5",
        "/chat"
    ],
};
