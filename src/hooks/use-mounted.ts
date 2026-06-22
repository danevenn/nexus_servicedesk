import { useSyncExternalStore } from "react";

// Hook SSR-safe: devuelve `false` durante el render del servidor y la
// hidratación inicial, y `true` tras montar en cliente, sin usar efectos.
// Útil para componentes que solo deben pintar en cliente (p. ej. Recharts,
// que necesita medir su contenedor). Antes se redefinía idéntico en varios
// componentes; centralizado aquí como única fuente de verdad.

const emptySubscribe = () => () => {};

export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
