"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { REPORT_DAYS } from "@/lib/reports-constants";

// Selector de periodo de análisis (30/90/365 días). Estado en la URL (?dias=).
export function ReportsPeriod({ days }: { days: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setDays(d: number) {
    const next = new URLSearchParams(params.toString());
    next.set("dias", String(d));
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex gap-1 rounded-full border p-0.5">
      {REPORT_DAYS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => setDays(d)}
          className={cn(
            "rounded-full px-3 py-1 text-xs transition-colors",
            days === d
              ? "bg-primary/10 font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {d} d
        </button>
      ))}
    </div>
  );
}
