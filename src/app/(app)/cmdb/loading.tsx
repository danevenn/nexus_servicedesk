import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

// Esqueleto del listado CMDB: cabecera + filtros + filas de tabla.
export default function CmdbLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-36" />
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="divide-y">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="ml-auto h-4 w-10" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
