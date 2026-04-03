export type EmailDisplay = {
  primary: string;
  secondary?: string;
  isPrivateRelay: boolean;
};

const APPLE_PRIVATE_RELAY_DOMAIN = "@privaterelay.appleid.com";

export function isApplePrivateRelayEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(APPLE_PRIVATE_RELAY_DOMAIN);
}

export function getEmailDisplay(email?: string | null): EmailDisplay {
  if (!email) {
    return {
      primary: "이메일 정보가 없습니다.",
      isPrivateRelay: false,
    };
  }

  if (isApplePrivateRelayEmail(email)) {
    return {
      primary: "Apple 비공개 이메일 사용 중",
      secondary: "이메일 가리기(Private Relay)로 보호되고 있어요.",
      isPrivateRelay: true,
    };
  }

  return {
    primary: email,
    isPrivateRelay: false,
  };
}
