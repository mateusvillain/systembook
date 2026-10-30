import { useMutation, useQuery } from '@tanstack/react-query';
import { Languages } from 'lucide-react';
import { toast } from 'sonner';
import { queryClient, useTRPC } from '../../lib/trpc.js';
import { ADMIN_LOCALE_NAMES, ADMIN_LOCALES, useT } from '../../i18n/AdminLocale.js';
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';

/** Valor do rádio para "sem preferência" (segue o navegador). */
const AUTOMATIC = 'auto';

/**
 * Idioma da interface no menu do usuário (SYS-175). A troca é otimista: o
 * `auth.me` em cache muda na hora (o painel inteiro re-renderiza no idioma
 * novo) e volta ao anterior se o server recusar.
 */
export function LanguageSubmenu() {
  const trpc = useTRPC();
  const t = useT();
  const meKey = trpc.auth.me.queryKey();
  const me = useQuery(trpc.auth.me.queryOptions());
  const preference = me.data?.idiomaInterface ?? null;

  const save = useMutation(
    trpc.auth.setInterfaceLanguage.mutationOptions({
      onMutate: async ({ idioma }) => {
        // Um refetch do `me` em voo (foco da janela) sobrescreveria o otimista.
        await queryClient.cancelQueries({ queryKey: meKey });
        const previous = queryClient.getQueryData(meKey);
        queryClient.setQueryData(meKey, (old) => (old ? { ...old, idiomaInterface: idioma } : old));
        return { previous };
      },
      onError: (_error, _input, context) => {
        queryClient.setQueryData(meKey, context?.previous);
        toast.error(t('language.saveFailed'));
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: meKey }),
    }),
  );

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Languages />
        {t('language.label')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={preference ?? AUTOMATIC}
          onValueChange={(value) => save.mutate({ idioma: value === AUTOMATIC ? null : value })}
        >
          <DropdownMenuRadioItem value={AUTOMATIC}>{t('language.automatic')}</DropdownMenuRadioItem>
          {ADMIN_LOCALES.map((locale) => (
            // `lang`: leitor de tela pronuncia cada nome no próprio idioma.
            <DropdownMenuRadioItem key={locale} value={locale} lang={locale}>
              {ADMIN_LOCALE_NAMES[locale]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
