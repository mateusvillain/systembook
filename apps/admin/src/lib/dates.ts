import { useMemo } from 'react';
import { useAdminLocale, useT } from '../i18n/AdminLocale.js';

/**
 * Formatação de datas do painel (Fase 10, TASK-87; locale ativo desde a
 * SYS-175).
 *
 * `relative` produz um rótulo curto ("2 days ago", "há 2 dias") para linhas de
 * metadados, degradando para "just now" em intervalos < 1 min. Use `absolute`
 * no `title=` do elemento para expor a data completa no hover (o relativo é a
 * leitura rápida; o absoluto é a precisão sob demanda).
 */
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

type DateInput = Date | number | string;

export interface DateFormat {
  relative(date: DateInput): string;
  absolute(date: DateInput): string;
  /** Só a hora ("3:05 PM", "15:05"). */
  time(date: DateInput): string;
  /** Data curta com dia da semana; o ano só aparece fora do ano corrente. */
  day(date: DateInput): string;
}

export function createDateFormat(locale: string, justNow: string): DateFormat {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  // Mesmas partes do `toLocaleString()` sem opções: data numérica + hora com segundos.
  const absolute = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
  const dayThisYear = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  const dayOtherYear = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    relative(date) {
      const seconds = Math.round((new Date(date).getTime() - Date.now()) / 1000); // negativo = passado
      const abs = Math.abs(seconds);
      for (const [unit, secondsPerUnit] of STEPS) {
        if (abs >= secondsPerUnit) return rtf.format(Math.round(seconds / secondsPerUnit), unit);
      }
      return justNow;
    },
    absolute: (date) => absolute.format(new Date(date)),
    time: (date) => time.format(new Date(date)),
    day(date) {
      const d = new Date(date);
      return (d.getFullYear() === new Date().getFullYear() ? dayThisYear : dayOtherYear).format(d);
    },
  };
}

/** Formatadores de data no idioma ativo do admin. */
export function useDateFormat(): DateFormat {
  const locale = useAdminLocale();
  const t = useT();
  return useMemo(() => createDateFormat(locale, t('dates.justNow')), [locale, t]);
}
