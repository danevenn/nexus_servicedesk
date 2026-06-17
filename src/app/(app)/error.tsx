"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Error boundary del área autenticada. Next lo monta si una página de servidor
// o un componente cliente lanza durante el render. `reset` reintenta el render.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // En producción esto iría a un servicio de observabilidad (Sentry…).
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Algo ha fallado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            No se ha podido cargar esta sección. Puedes reintentar; si el
            problema persiste, vuelve a intentarlo más tarde.
          </p>
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground">
              Referencia: {error.digest}
            </p>
          )}
          <Button onClick={reset} variant="outline" size="sm">
            <RotateCcw className="size-4" />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
