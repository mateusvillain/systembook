import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryClient, useTRPC, type RouterOutput } from '../../lib/trpc.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type TokenRow = RouterOutput['uploadTokens']['list'][number];
type TokenScope = TokenRow['escopo'];

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50';

/** Rótulo e efeito da revogação de cada escopo (SYS-110). */
const SCOPES: Record<TokenScope, { label: string; revokeEffect: string }> = {
  previews: {
    label: 'Preview upload (CI)',
    revokeEffect: 'The CI using it will no longer be able to publish previews.',
  },
  migration: {
    label: 'Migration (export/import)',
    revokeEffect: 'The CLI using it will no longer be able to export or import content.',
  },
};

/**
 * Gestão de tokens de upload de CI (TASK-44). O token em claro só existe na
 * resposta do create — o reveal único abaixo é a única chance de copiá-lo.
 * A migração para shadcn (TASK-80) preserva essa propriedade: o valor só vive
 * no estado `revealed` (mostrado uma vez, `data-token-value`); a lista nunca
 * recebe o valor em claro.
 */
export function UploadTokens() {
  const trpc = useTRPC();
  const tokens = useQuery(trpc.uploadTokens.list.queryOptions());
  const [revealed, setRevealed] = useState<{ label: string; token: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries(trpc.uploadTokens.list.queryFilter());

  const revoke = useMutation(
    trpc.uploadTokens.revoke.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success('Token revoked.');
      },
    }),
  );

  return (
    <section className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Tokens</h1>
        <p className="text-muted-foreground text-sm">
          Each token does one thing. <strong>Preview upload</strong> tokens authenticate the team CI
          when uploading preview artifacts (<code>POST /api/previews</code>).{' '}
          <strong>Migration</strong> tokens let the <code>systembook</code> CLI export this instance
          to files or import files into it — they read and write all content, so keep them out of
          CI. Revoke any token that leaks.
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
          toast.success('Token generated — copy it now.');
        }}
      />

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Created at</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
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
                        `Revoke the token "${token.label}"? ${SCOPES[token.escopo].revokeEffect}`,
                      )
                    ) {
                      revoke.mutate({ tokenId: token.id });
                    }
                  }}
                />
              ))}
            </TableBody>
          </Table>
          {tokens.isPending && <p className="text-muted-foreground mt-2">Loading tokens…</p>}
          {tokens.data?.length === 0 && (
            <p className="text-muted-foreground mt-2">No tokens generated yet.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function TokenTableRow({ token, onRevoke }: { token: TokenRow; onRevoke: () => void }) {
  const revogado = token.revogadoEm != null;
  return (
    <TableRow className={revogado ? 'opacity-60' : undefined}>
      <TableCell>{token.label}</TableCell>
      <TableCell>{SCOPES[token.escopo].label}</TableCell>
      <TableCell>{new Date(token.criadoEm).toLocaleString('en-US')}</TableCell>
      <TableCell>
        {revogado ? (
          <Badge variant="secondary">
            Revoked on {new Date(token.revogadoEm!).toLocaleString('en-US')}
          </Badge>
        ) : (
          <Badge>Active</Badge>
        )}
      </TableCell>
      <TableCell>
        {!revogado && (
          <Button type="button" size="sm" variant="outline" onClick={onRevoke}>
            Revoke
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
  const [copied, setCopied] = useState(false);
  return (
    <div
      role="alert"
      data-token-reveal
      className="grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-4"
    >
      <strong>Token &quot;{label}&quot; generated — copy it now.</strong>
      <span className="text-sm">
        This value <strong>will not be shown again</strong>: only the hash is stored.
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
          {copied ? 'Copied ✓' : 'Copy'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          Close
        </Button>
      </div>
    </div>
  );
}

function CreateTokenForm({ onCreated }: { onCreated: (r: { label: string; token: string }) => void }) {
  const trpc = useTRPC();
  const [label, setLabel] = useState('');
  const [escopo, setEscopo] = useState<TokenScope>('previews');
  const create = useMutation(
    trpc.uploadTokens.create.mutationOptions({
      onSuccess: (created) => {
        setLabel('');
        onCreated(created);
      },
    }),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (label.trim()) create.mutate({ label: label.trim(), escopo });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="grid flex-1 gap-2" style={{ maxWidth: 360 }}>
        <Label htmlFor="token-label">New token</Label>
        <Input
          id="token-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="e.g. design system GitHub Actions"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="token-scope">Scope</Label>
        <select
          id="token-scope"
          className={selectClass}
          value={escopo}
          onChange={(event) => setEscopo(event.target.value as TokenScope)}
        >
          {(Object.keys(SCOPES) as TokenScope[]).map((scope) => (
            <option key={scope} value={scope}>
              {SCOPES[scope].label}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={create.isPending || !label.trim()}>
        Generate token
      </Button>
    </form>
  );
}
