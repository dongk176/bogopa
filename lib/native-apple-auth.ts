"use client";

import { registerPlugin } from "@capacitor/core";

export type NativeAppleAuthSignInResult = {
  identityToken: string;
  authorizationCode?: string;
  userIdentifier: string;
  email?: string;
  givenName?: string;
  familyName?: string;
};

type NativeAppleAuthPlugin = {
  signIn(options?: { state?: string }): Promise<NativeAppleAuthSignInResult>;
};

export const NativeAppleAuth = registerPlugin<NativeAppleAuthPlugin>("NativeAppleAuth");

