import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Expone todos los endpoints de better-auth bajo /api/auth/*.
export const { GET, POST } = toNextJsHandler(auth);
