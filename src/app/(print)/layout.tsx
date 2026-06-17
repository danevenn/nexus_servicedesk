// Layout mínimo para vistas imprimibles: sin sidebar ni cabecera de la app.
// Protegido por el middleware (sesión) y por el RBAC del servicio.
export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl p-6 print:max-w-none print:p-0">
      {children}
    </div>
  );
}
