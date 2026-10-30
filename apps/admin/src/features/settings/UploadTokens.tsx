import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryClient, useTRPC, type RouterOutput } from '../../lib/trpc.js';
import { useDateFormat } from '../../lib/dates.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nativeSelectClass } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useT } from '../../i18n/AdminLocale.js';
import type { AdminMessageKey } from '../../i18n/messages/en.js';
import { formatRich } from '@systembook/docs-site';

type TokenRow = RouterOutput['uploadTokens']['list'][number];
type TokenScope = TokenRow['escopo'];


/** Rótulo e efeito da revogação de cada escopo (SYS-110). */
const SCOPES = {
  previews: { label: 'uploadTokens.scope.previews', revokeEffect: 'uploadTokens.revokeEffect.previews' },
  migration: { label: 'uploadTokens.scope.migration', revokeEffect: 'uploadTokens.revokeEffect.migration' },
  tokens: { label: 'uploadTokens.scope.tokens', revokeEffect: 'uploadTokens.revokeEffect.tokens' },
} as const satisfies Record<TokenScope, { label: AdminMessageKey; revokeEffect: AdminMessageKey }>;

/**
 * Gestão de tokens de upload de CI (TASK-44). O token em claro só existe na
 * resposta do create — o reveal único abaixo é a única chance de copiá-lo.
 * A migração para shadcn (TASK-80) preserva essa propriedade: o valor só vive
 * no estado `revealed` (mostrado uma vez, `data-token-value`); a lista nunca
 * recebe o valor em claro.
 */
export function UploadTokens() {
  const trpc = useTRPC();
  const t = useT();
  const tokens = useQuery(trpc.uploadTokens.list.queryOptions());
  const [revealed, setRevealed] = useState<{ label: string; token: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries(trpc.uploadTokens.list.queryFilter());

  const revoke = useMutation(
    trpc.uploadTokens.revoke.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success(t('uploadTokens.revoked'));
      },
      onError: () => toast.error(t('uploadTokens.revokeFailed')),
    }),
  );

  return (
    <section className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t('uploadTokens.title')}</h1>
        <p className="text-muted-foreground text-sm">
          {formatRich(t('uploadTokens.intro'), {
            previews: <strong>{t('uploadTokens.intro.previews')}</strong>,
            previewsEndpoint: <code>POST /api/previews</code>,
            tokens: <strong>{t('uploadTokens.intro.tokens')}</strong>,
            tokensCommand: <code>systembook tokens</code>,
            tokensEndpoint: <code>POST /api/tokens</code>,
            migration: <strong>{t('uploadTokens.intro.migration')}</strong>,
            cli: <code>systembook</code>,
          })}
        </p>
      </div>

      {revealed && (
        <TokenReveal
          label={revealed.label}
          token={revealed.token}
          onDismiss={() => setRevealed(null)}
        />
      )}

      <CreateTokenForm
        onCreated={(created) => {
          setRevealed(created);
          void invalidate();
          toast.success(t('uploadTokens.generated'));
        }}
      />

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('uploadTokens.label')}</TableHead>
                <TableHead>{t('uploadTokens.scopeColumn')}</TableHead>
                <TableHead>{t('uploadTokens.createdAt')}</TableHead>
                <TableHead>{t('uploadTokens.status')}</TableHead>
                <TableHead>{t('uploadTokens.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tokens.data ?? []).map((token) => (
                <TokenTableRow
                  key={token.id}
                  token={token}
                  onRevoke={() => {
                    if (
                      window.confirm(
                        t('uploadTokens.revokeConfirm', {
                          name: token.label,
                          effect: t(SCOPES[token.escopo].revokeEffect),
                        }),
                      )
                    ) {
                      revoke.mutate({ tokenId: token.id });
                    }
                  }}
                />
              ))}
            </TableBody>
          </Table>
          {tokens.isPending && <p className="text-muted-foreground mt-2">{t('uploadTokens.loading')}</p>}
          {tokens.data?.length === 0 && (
            <p className="text-muted-foreground mt-2">{t('uploadTokens.empty')}</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function TokenTableRow({ token, onRevoke }: { token: TokenRow; onRevoke: () => void }) {
  const revogado = token.revogadoEm != null;
  const dates = useDateFormat();
  const t = useT();
  return (
    <TableRow className={revogado ? 'opacity-60' : undefined}>
      <TableCell>{token.label}</TableCell>
      <TableCell>{t(SCOPES[token.escopo].label)}</TableCell>
      <TableCell>{dates.absolute(token.criadoEm)}</TableCell>
      <TableCell>
        {revogado ? (
          <Badge variant="secondary">
            {t('uploadTokens.revokedOn', { date: dates.absolute(token.revogadoEm!) })}
          </Badge>
        ) : (
          <Badge>{t('uploadTokens.active')}</Badge>
        )}
      </TableCell>
      <TableCell>
        {!revogado && (
          <Button type="button" size="sm" variant="outline" onClick={onRevoke}>
            {t('uploadTokens.revoke')}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function TokenReveal({
  label,
  token,
  onDismiss,
}: {
  label: string;
  token: string;
  onDismiss: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div
      role="alert"
      data-token-reveal
      className="grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-4"
    >
      <strong>{t('uploadTokens.revealTitle', { name: label })}</strong>
      <span className="text-sm">
        {formatRich(t('uploadTokens.revealBody'), { never: <strong>{t('uploadTokens.revealNever')}</strong> })}
      </span>
      <code
        data-token-value
        className="rounded border bg-background p-2 break-all select-all"
      >
        {token}
      </code>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(token).then(() => setCopied(true));
          }}
        >
          {copied ? t('uploadTokens.copied') : t('uploadTokens.copy')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}

function CreateTokenForm({ onCreated }: { onCreated: (r: { label: string; token: string }) => void }) {
  const trpc = useTRPC();
  const t = useT();
  const [label, setLabel] = useState('');
  const [escopo, setEscopo] = useState<TokenScope>('previews');
  const create = useMutation(
    trpc.uploadTokens.create.mutationOptions({
      onSuccess: (created) => {
        setLabel('');
        onCreated(created);
      },
      onError: () => toast.error(t('uploadTokens.createFailed')),
    }),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (label.trim()) create.mutate({ label: label.trim(), escopo });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="grid flex-1 gap-2" style={{ maxWidth: 360 }}>
        <Label htmlFor="token-label">{t('uploadTokens.new')}</Label>
        <Input
          id="token-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={t('uploadTokens.placeholder')}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="token-scope">{t('uploadTokens.scopeColumn')}</Label>
        <select
          id="token-scope"
          className={nativeSelectClass}
          value={escopo}
          onChange={(event) => setEscopo(event.target.value as TokenScope)}
        >
          {(Object.keys(SCOPES) as TokenScope[]).map((scope) => (
            <option key={scope} value={scope}>
              {t(SCOPES[scope].label)}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={create.isPending || !label.trim()}>
        {t('uploadTokens.generate')}
      </Button>
    </form>
  );
}
