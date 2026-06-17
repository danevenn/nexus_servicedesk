import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

// Configuración de better-auth con adaptador Prisma.
// El rol se modela como campo adicional sobre el usuario; `input: false`
// impide que alguien se autoasigne rol al registrarse (se asigna por servicio).
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // En producción se confía en BETTER_AUTH_URL automáticamente; en local
  // aceptamos también 127.0.0.1 (algunos navegadores resuelven localhost a ::1).
  trustedOrigins: [
    "http://localhost:3300",
    "http://127.0.0.1:3300",
  ],
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "REQUESTER",
        input: false,
      },
    },
  },
});
