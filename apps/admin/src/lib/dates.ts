/**
 * Formatação de datas do painel (Fase 10, TASK-87).
 *
 * `formatRelative` produz um rótulo curto em pt-BR ("há 2 dias", "há 3 meses")
 * para a linha de metadados do Section Header, degradando para "agora mesmo"
 * em intervalos < 1 min. Use `formatAbsolute` no `title=` do elemento para
 * expor a data completa no hover (o relativo é a leitura rápida; o absoluto é
 * a precisão sob demanda).
 */
const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

export function formatRelative(date: Date | number | string): string {
  const then = new Date(date).getTime();
  const seconds = Math.round((then - Date.now()) / 1000); // negativo = passado
  const abs = Math.abs(seconds);
  if (abs < 60) return 'agora mesmo';
  for (const [unit, secondsPerUnit] of STEPS) {
    if (abs >= secondsPerUnit) {
      return rtf.format(Math.round(seconds / secondsPerUnit), unit);
    }
  }
  return 'agora mesmo';
}

export function formatAbsolute(date: Date | number | string): string {
  return new Date(date).toLocaleString('pt-BR');
}
