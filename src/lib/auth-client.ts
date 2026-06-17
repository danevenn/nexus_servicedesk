"use client";

import { createAuthClient } from "better-auth/react";

// Cliente de better-auth para el navegador. Sin baseURL: usa el origen actual.
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
