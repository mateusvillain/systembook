import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryClient, useTRPC } from '../../lib/trpc.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Variant = 'light' | 'dark';

/** Espelha os limites do server (`db/settings.ts`) para errar cedo e específico. */
const ACCEPTED_MIMES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;
const MAX_BYTES = 512 * 1024;
const ACCEPT_ATTR = '.png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml';

/** Lê o arquivo como base64 puro (sem o prefixo `data:…;base64,`). */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Identidade do design system (SYS-39): nome e logo da instância. Admin-only —
 * o gate de role fica na página, a rota já é `adminProcedure`.
 *
 * A variante dark existe porque logo monocromático de tinta escura some sobre
 * o fundo escuro da doc. Cada preview é renderizado **sobre o fundo do tema a
 * que serve**, para o admin ver esse problema aqui e não em produção.
 */
export function BrandSettings() {
  const trpc = useTRPC();
  const settings = useQuery(trpc.settings.get.queryOptions());
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.settings.get.queryFilter()),
      queryClient.invalidateQueries(trpc.settings.getPublic.queryFilter()),
    ]);

  return (
    <section className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Design system identity</h1>
        <p className="text-muted-foreground text-sm">
          The name and logo shown at the top of the public documentation sidebar. Without a logo,
          the name is shown as text.
        </p>
      </div>

      <NameForm
        value={settings.data?.nomeDesignSystem ?? ''}
        pending={settings.isPending}
        onSaved={invalidate}
      />

      <LogoSlot
        variant="light"
        title="Logo"
        hint="Used on the light theme, and on both themes when no dark version is set."
        url={settings.data?.logoUrl ?? null}
        name={settings.data?.nomeDesignSystem ?? ''}
        onChanged={invalidate}
      />
      <LogoSlot
        variant="dark"
        title="Logo — dark theme"
        hint="Optional. Set one if your logo is dark ink and disappears on the dark background."
        url={settings.data?.logoDarkUrl ?? null}
        name={settings.data?.nomeDesignSystem ?? ''}
        onChanged={invalidate}
      />
    </section>
  );
}

function NameForm({
  value,
  pending,
  onSaved,
}: {
  value: string;
  pending: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const [draft, setDraft] = useState(value);
  // A query resolve depois do primeiro render: sincroniza o rascunho quando o
  // valor salvo chega ou muda por fora.
  useEffect(() => setDraft(value), [value]);

  const save = useMutation(
    trpc.settings.setNome.mutationOptions({
      onSuccess: async () => {
        await onSaved();
        toast.success('Name saved.');
      },
      onError: () => toast.error('Could not save the name.'),
    }),
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const nome = draft.trim();
    if (!nome) return;
    save.mutate({ nomeDesignSystem: nome });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form className="grid gap-3 sm:max-w-md" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="ds-name">Name</Label>
            <Input
              id="ds-name"
              value={draft}
              disabled={pending}
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <div>
            <Button type="submit" disabled={save.isPending || !draft.trim() || draft === value}>
              Save name
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function LogoSlot({
  variant,
  title,
  hint,
  url,
  name,
  onChanged,
}: {
  variant: Variant;
  title: string;
  hint: string;
  url: string | null;
  name: string;
  onChanged: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = useMutation(trpc.settings.uploadLogo.mutationOptions());
  const remove = useMutation(trpc.settings.removeLogo.mutationOptions());

  async function onPick(file: File | undefined) {
    if (!file) return;
    // Valida antes de enviar: o erro fica específico e não gasta round-trip.
    if (!ACCEPTED_MIMES.includes(file.type as (typeof ACCEPTED_MIMES)[number])) {
      toast.error('Use a PNG, JPG or SVG file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`The file must be at most ${MAX_BYTES / 1024} KB.`);
      return;
    }
    setBusy(true);
    try {
      const dataBase64 = await readAsBase64(file);
      await upload.mutateAsync({ variant, mime: file.type as (typeof ACCEPTED_MIMES)[number], dataBase64 });
      await onChanged();
      toast.success('Logo updated.');
    } catch {
      toast.error('Could not upload the logo.');
    } finally {
      setBusy(false);
      // Permite reenviar o mesmo arquivo depois de remover.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      await remove.mutateAsync({ variant });
      await onChanged();
      toast.success('Logo removed.');
    } catch {
      toast.error('Could not remove the logo.');
    } finally {
      setBusy(false);
    }
  }

  const inputId = `logo-${variant}`;

  return (
    <Card>
      <CardContent className="grid gap-4 pt-6">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-muted-foreground text-sm">{hint}</p>
        </div>

        {/* Preview sobre o fundo do tema a que a variante serve — é onde um
            logo de baixo contraste se denuncia. Largura contida: em largura
            total, um logo de 120×21 flutua num campo vazio e a caixa parece
            quebrada; contido, lê como amostra. */}
        <div
          className="flex min-h-20 max-w-sm items-center justify-center rounded-editorial-md border p-6"
          style={{ background: variant === 'dark' ? '#010409' : '#f3f3f4' }}
          data-testid={`logo-preview-${variant}`}
        >
          {url ? (
            <img src={url} alt={`${name} logo`} className="max-h-10 max-w-[220px]" />
          ) : (
            <span
              className="text-sm"
              style={{ color: variant === 'dark' ? '#9aa4b2' : '#57606a' }}
            >
              {variant === 'dark'
                ? 'No dark version — the light logo is used.'
                : `No logo — “${name}” is shown as text.`}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor={inputId} className="sr-only">
            {title} file
          </Label>
          <Input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT_ATTR}
            disabled={busy}
            className="max-w-xs"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          {url && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void onRemove()}>
              Remove
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">PNG, JPG or SVG, up to 512 KB.</p>
      </CardContent>
    </Card>
  );
}
