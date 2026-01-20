// app/routes/app._index.tsx
export default function AppIndexRoute() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-6">
        <h1 className="text-xl font-semibold">Catálogo (placeholder SSR)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Próximo passo: listar mídias do Supabase, filtros por tags, busca e paginação.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-white p-4">
            <div className="aspect-video rounded-lg bg-muted" />
            <div className="mt-3 h-4 w-2/3 rounded bg-muted" />
            <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
