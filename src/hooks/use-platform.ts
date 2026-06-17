import * as React from "react";

// Detecta si el cliente es macOS para mostrar el modificador correcto en los
// atajos (⌘ en Mac, Ctrl en Windows/Linux). La funcionalidad ya acepta ambos
// (metaKey || ctrlKey); esto es solo para la etiqueta visible.
//
// useSyncExternalStore: snapshot de servidor estable (asumimos Mac en SSR para
// no parpadear en el caso más común) y resuelve la hidratación sin setState.
function subscribe() {
  // La plataforma no cambia durante la sesión: nada a lo que suscribirse.
  return () => {};
}

function getSnapshot() {
  const ua =
    navigator.userAgent || navigator.platform || "";
  return /Mac|iPhone|iPod|iPad/i.test(ua);
}

export function useIsMac() {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => true);
}
