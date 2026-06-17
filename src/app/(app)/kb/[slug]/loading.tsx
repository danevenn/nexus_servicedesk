import { Skeleton } from "@/components/ui/skeleton";

// Esqueleto del detalle de un artículo: cabecera + párrafos del cuerpo.
export default function ArticleLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Skeleton className="h-4 w-48" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="space-y-3 pt-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className={i % 3 === 0 ? "h-4 w-1/3" : "h-4 w-full"} />
        ))}
      </div>
    </div>
  );
}
