"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Archive, Check, Search } from "lucide-react";
import { toast } from "sonner";
import {
  createArticleAction,
  updateArticleAction,
  archiveArticleAction,
} from "@/app/actions/kb";
import { ArticleBody } from "@/components/kb/article-body";
import { KB_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type KbStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type Ci = { id: string; name: string };

type Props = {
  mode: "create" | "edit";
  articleId?: string;
  categories: string[];
  cis: Ci[];
  initial?: {
    title: string;
    summary: string;
    body: string;
    category: string;
    status: KbStatus;
    slug: string;
    relatedCiIds: string[];
  };
};

// Réplica cliente del slugify del servicio: solo para previsualizar la URL al
// crear (el slug definitivo lo fija el servidor).
function slugifyPreview(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 70);
}

export function ArticleEditor({ mode, articleId, categories, cis, initial }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [status, setStatus] = useState<KbStatus>(initial?.status ?? "PUBLISHED");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initial?.relatedCiIds ?? []),
  );
  const [ciFilter, setCiFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // slug: al crear se deriva del título; al editar es estable (no se cambia
  // para no romper enlaces existentes).
  const slugPreview = mode === "create" ? slugifyPreview(title) : initial?.slug;

  const filteredCis = useMemo(() => {
    const q = ciFilter.trim().toLowerCase();
    const base = q ? cis.filter((c) => c.name.toLowerCase().includes(q)) : cis;
    return base.slice(0, 60);
  }, [cis, ciFilter]);

  function toggleCi(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const relatedCiIds = [...selected];
      const result =
        mode === "create"
          ? await createArticleAction({ title, summary, body, category, status, relatedCiIds })
          : await updateArticleAction({
              id: articleId as string,
              title,
              summary,
              body,
              category,
              status,
              relatedCiIds,
            });
      toast.success(mode === "create" ? "Artículo creado" : "Artículo guardado");
      router.push(`/kb/${result.slug}`);
      router.refresh();
    } catch (err) {
      toast.error("No se pudo guardar", {
        description: err instanceof Error ? err.message : undefined,
      });
      setSaving(false);
    }
  }

  async function onArchive() {
    if (!articleId) return;
    setArchiving(true);
    try {
      await archiveArticleAction(articleId);
      toast.success("Artículo archivado");
      router.push("/kb");
      router.refresh();
    } catch (err) {
      toast.error("No se pudo archivar", {
        description: err instanceof Error ? err.message : undefined,
      });
      setArchiving(false);
    }
  }

  const backHref = mode === "edit" && initial ? `/kb/${initial.slug}` : "/kb";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Volver
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "create" ? "Nuevo artículo" : "Editar artículo"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {mode === "edit" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onArchive}
              disabled={archiving || status === "ARCHIVED"}
            >
              <Archive className="size-4" />
              {status === "ARCHIVED" ? "Archivado" : "Archivar"}
            </Button>
          )}
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="title">Título</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={3}
            maxLength={160}
          />
          {slugPreview && (
            <p className="text-xs text-muted-foreground">
              URL: <code className="font-mono">/kb/{slugPreview || "…"}</code>
              {mode === "edit" && " (no cambia al editar)"}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="category">Categoría</Label>
            <Input
              id="category"
              list="kb-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              minLength={2}
              maxLength={60}
            />
            <datalist id="kb-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-2">
            <Label>Estado</Label>
            <Select
              items={KB_STATUS_LABEL}
              value={status}
              onValueChange={(v) => {
                if (v) setStatus(v as KbStatus);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KB_STATUS_LABEL) as KbStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {KB_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="summary">Resumen</Label>
        <Input
          id="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          required
          minLength={3}
          maxLength={300}
          placeholder="Una frase que describa de qué trata el artículo."
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="body">Cuerpo (Markdown)</Label>
        <div className="grid gap-3 lg:grid-cols-2">
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={18}
            className="font-mono text-[13px] leading-6"
            placeholder={"## Sección\n\nEscribe el procedimiento en Markdown…"}
          />
          <div className="min-h-72 overflow-auto rounded-lg border bg-muted/30 p-4">
            {body.trim() ? (
              <ArticleBody body={body} />
            ) : (
              <p className="text-sm text-muted-foreground">
                La vista previa aparecerá aquí.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>CIs relacionados {selected.size > 0 && `(${selected.size})`}</Label>
        <div className="rounded-lg border p-3">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={ciFilter}
              onChange={(e) => setCiFilter(e.target.value)}
              placeholder="Filtrar elementos de configuración…"
              className="h-8 pl-8"
            />
          </div>
          {cis.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay CIs disponibles.</p>
          ) : (
            <ul className="grid max-h-56 grid-cols-1 gap-1 overflow-auto sm:grid-cols-2">
              {filteredCis.map((c) => {
                const on = selected.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => toggleCi(c.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors",
                        on
                          ? "border-primary/40 bg-primary/10"
                          : "border-transparent hover:bg-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                        )}
                      >
                        {on && <Check className="size-3" />}
                      </span>
                      <span className="truncate font-mono text-[13px]">{c.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </form>
  );
}
