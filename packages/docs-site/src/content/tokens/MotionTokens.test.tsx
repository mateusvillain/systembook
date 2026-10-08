// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import type { Token, TokenType, TokenValue } from '@systembook/schema';
import { setupDom } from '../../../test/dom.js';
import { MotionTokens, parseDurationMs, parseEasing } from './MotionTokens.js';

const dom = setupDom();

const token = (path: string, type: TokenType, value: TokenValue): Token => ({
  path,
  type,
  byMode: { default: { value, resolvedValue: value } },
});

const row = (path: string) =>
  [...dom.container().querySelectorAll<HTMLElement>('tbody tr')].find((r) => r.querySelector('th')!.textContent === path)!;
const dot = (el: HTMLElement) => el.querySelector<HTMLElement>('.sb-token-motion-dot')!;

describe('parseEasing / parseDurationMs', () => {
  it('curvas e palavras-chave; steps() e x fora de [0, 1] não são curva', () => {
    expect(parseEasing('cubic-bezier(0.2, 0, 0, 1)')).toEqual([0.2, 0, 0, 1]);
    expect(parseEasing('ease-in-out')).toEqual([0.42, 0, 0.58, 1]);
    expect(parseEasing('steps(4, end)')).toBeNull();
    expect(parseEasing('cubic-bezier(1.5, 0, 0, 1)')).toBeNull();
    expect(parseEasing('cubic-bezier(0, 1)')).toBeNull();
  });

  it('ms e s', () => {
    expect(parseDurationMs('120ms')).toBe(120);
    expect(parseDurationMs('0.2s')).toBe(200);
    expect(parseDurationMs('0ms')).toBe(0);
    expect(parseDurationMs('fast')).toBeNull();
  });
});

describe('MotionTokens (SYS-151)', () => {
  it('curva vira gráfico; duração vira barra na escala da maior; transition tem curva e tempo próprios', () => {
    dom.render(
      <MotionTokens
        tokens={[
          token('easing.standard', 'cubicBezier', [0.2, 0, 0, 1]),
          token('easing.overshoot', 'cubicBezier', [0.3, 0, 0, 1.5]),
          token('duration.fast', 'duration', '100ms'),
          token('duration.slow', 'duration', { value: 0.4, unit: 's' }),
          token('transition.enter', 'transition', { duration: '200ms', delay: '50ms', timingFunction: 'ease-out' }),
        ]}
        modes={['default']}
      />,
    );
    const curve = row('easing.standard').querySelector('.sb-token-curve-path')!;
    expect(curve.getAttribute('d')).toBe('M0 0 C 0.2 0 0 -1 1 -1');
    expect(row('easing.standard').querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    // passa de 1: o viewBox abre espaço em cima
    expect(row('easing.overshoot').querySelector('svg')!.getAttribute('viewBox')).toBe('-0.1 -1.6 1.2 1.7');

    const bar = (path: string) => row(path).querySelector<HTMLElement>('.sb-token-duration')!.style.getPropertyValue('--sb-token-duration');
    expect([bar('duration.fast'), bar('duration.slow')]).toEqual(['25%', '100%']);
    expect(row('duration.fast').querySelector('.sb-token-curve')).toBeNull();

    const enter = dot(row('transition.enter'));
    expect(row('transition.enter').querySelector('.sb-token-curve-path')!.getAttribute('d')).toBe('M0 0 C 0 0 0.58 -1 1 -1');
    expect([
      enter.style.getPropertyValue('--sb-motion-easing'),
      enter.style.getPropertyValue('--sb-motion-duration'),
      enter.style.getPropertyValue('--sb-motion-delay'),
    ]).toEqual(['ease-out', '200ms', '50ms']);
    // curva sem tempo próprio anda no tempo de leitura
    expect(dot(row('easing.standard')).style.getPropertyValue('--sb-motion-duration')).toBe('800ms');
    expect(dot(row('duration.slow')).style.getPropertyValue('--sb-motion-easing')).toBe('linear');
  });

  it('nada anda sozinho; o play reinicia o ponto', async () => {
    dom.render(<MotionTokens tokens={[token('duration.fast', 'duration', '100ms')]} modes={['default']} />);
    const before = dot(row('duration.fast'));
    expect(before.hasAttribute('data-running')).toBe(false);
    const play = row('duration.fast').querySelector<HTMLButtonElement>('.sb-token-motion-play')!;
    expect(play.getAttribute('aria-label')).toBe('Play duration.fast');

    await act(async () => play.click());
    const first = dot(row('duration.fast'));
    expect(first.hasAttribute('data-running')).toBe(true);
    expect(first).not.toBe(before);
    await act(async () => play.click());
    expect(dot(row('duration.fast'))).not.toBe(first);
  });

  it('com uma coluna por modo, o modo entra no nome do play; alça extrema não estica o gráfico', () => {
    const twoModes = (path: string, type: TokenType, light: TokenValue, dark: TokenValue): Token => ({
      path,
      type,
      byMode: { light: { value: light, resolvedValue: light }, dark: { value: dark, resolvedValue: dark } },
    });
    const wild = [0.5, 10, 0.5, -10];
    dom.render(
      <MotionTokens
        tokens={[twoModes('duration.base', 'duration', '200ms', '300ms'), twoModes('easing.wild', 'cubicBezier', wild, wild)]}
        modes={['light', 'dark']}
      />,
    );
    expect([...row('duration.base').querySelectorAll('.sb-token-motion-play')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Play duration.base (light)',
      'Play duration.base (dark)',
    ]);
    expect(row('easing.wild').querySelector('svg')!.getAttribute('viewBox')).toBe('-0.1 -2.1 1.2 3.2');
  });

  it('sem amostra quando não há curva nem tempo: steps(), valor sem conversão', () => {
    dom.render(
      <MotionTokens
        tokens={[token('easing.steps', 'cubicBezier', 'steps(4, end)'), token('transition.broken', 'transition', { duration: '200ms' })]}
        modes={['default']}
      />,
    );
    expect(dom.container().querySelectorAll('.sb-token-motion')).toHaveLength(0);
    expect([...dom.container().querySelectorAll('.sb-token-value')].map((v) => v.textContent)).toEqual(['steps(4, end)', '{"duration":"200ms"}']);
  });
});
