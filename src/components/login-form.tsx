"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO_PASSWORD = "Password123!";
const QUICK = [
  { email: "admin@nexo.dev", role: "Administrador" },
  { email: "agente@nexo.dev", role: "Técnico" },
  { email: "cliente@nexo.dev", role: "Solicitante" },
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("agente@nexo.dev");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [loading, setLoading] = useState<"form" | "demo" | null>(null);

  async function loginAs(mail: string, pass: string, which: "form" | "demo") {
    setLoading(which);
    const { error } = await signIn.email({ email: mail, password: pass });
    setLoading(null);
    if (error) {
      toast.error("No se pudo iniciar sesión", { description: error.message });
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          loginAs(email, password, "form");
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading !== null}>
          {loading === "form" ? "Entrando…" : "Iniciar sesión"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        o
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={loading !== null}
        onClick={() => loginAs("demo@nexo.dev", DEMO_PASSWORD, "demo")}
      >
        <Eye className="size-4" />
        {loading === "demo" ? "Entrando…" : "Ver demo (solo lectura)"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Explora toda la mesa de servicio sin modificar datos.
      </p>

      <div className="border-t pt-3 text-xs text-muted-foreground">
        <p className="mb-1.5">Accesos rápidos de prueba (contraseña común):</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => setEmail(d.email)}
              className="rounded-md border px-2 py-1 transition-colors hover:bg-accent"
            >
              {d.role}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
