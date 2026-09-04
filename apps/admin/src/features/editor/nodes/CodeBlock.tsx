import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import { Check, Copy, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createLowlight } from 'lowlight';
import { copyText } from '../../../lib/clipboard.js';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import scss from 'highlight.js/lib/languages/scss';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

/**
 * Code block com syntax highlighting (SYS-27/28). Substitui o
 * `@tiptap/extension-code-block` puro: `CodeBlockLowlight` tokeniza o conteúdo
 * via decorations do ProseMirror (classes `hljs-*`), e o NodeView React
 * acrescenta o chrome — nome da linguagem e botão de copiar.
 *
 * O modelo de conteúdo **não muda**: o nó continua sendo `codeBlock` com o
 * atributo `language`, exatamente como o serializer do server já grava/lê
 * (`blocks/serialize.ts`, bloco `code`). Conteúdo salvo antes desta mudança
 * (inclusive com `language: null`) renderiza sem alteração de estrutura.
 */

/**
 * Registro explícito de linguagens (em vez do bundle "all" do highlight.js, que
 * pesa ~1 MB): cobre o que aparece em documentação de design system — web,
 * config, shell e as plataformas móveis/backend mais comuns.
 */
const lowlight = createLowlight({
  bash,
  css,
  diff,
  java,
  javascript,
  json,
  markdown,
  php,
  plaintext,
  python,
  ruby,
  scss,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
});

/**
 * Linguagens oferecidas no seletor do editor. `value` é o nome registrado no
 * lowlight (ou um alias que ele resolve, como `html` → `xml`); `label` é o que
 * o leitor vê no bloco.
 */
const LANGUAGES: { value: string; label: string }[] = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'xml', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'diff', label: 'Diff' },
  { value: 'sql', label: 'SQL' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'swift', label: 'Swift' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
];

/** Valor do `<select>` para "sem linguagem" — o atributo em si é `null`. */
const PLAIN = 'plain';

function labelFor(language: unknown): string | null {
  if (typeof language !== 'string' || language === '') return null;
  const known = LANGUAGES.find((l) => l.value === language);
  // Linguagem gravada fora do seletor (conteúdo antigo, import): mostra o
  // próprio identificador em vez de esconder a informação.
  return known ? known.label : language;
}

/** Quanto tempo o botão fica dizendo "Copied" antes de voltar ao repouso. */
const FEEDBACK_MS = 2000;

/**
 * Quanto tempo ficam as instruções de cópia manual. Bem mais que o sucesso de
 * propósito: "Copied" é um recibo (some quando o leitor já leu), mas
 * "Press ⌘C" é uma tarefa que ainda não foi feita — expirar em 2s apagaria a
 * instrução antes de quem tem um bloco longo à frente conseguir agir.
 */
const INSTRUCTION_MS = 10000;

/**
 * Desfecho da cópia, quando nem a Clipboard API nem `execCommand` funcionaram:
 * em vez de um erro sem saída, o botão instrui a copiar pelo teclado — o leitor
 * sai com o código do mesmo jeito, que é o critério da issue.
 *
 * São dois desfechos porque o texto tem de ser honesto sobre o que aconteceu:
 * `manual` é o caso em que o bloco ficou com o código **selecionado**; `select`
 * é quando não dá para selecionar por conta do leitor (ver `selectCode`) e ele
 * precisa selecionar à mão antes do ⌘C.
 */
type CopyState = 'idle' | 'copied' | 'manual' | 'select';

/**
 * As falas de cada estado, juntas: o rótulo curto no botão, o ícone, o nome
 * acessível e o que a região viva anuncia. Num mapa em vez de ternários
 * espalhados pelo componente — assim o que muda quando um estado muda está tudo
 * numa linha, e não a cem caracteres de distância.
 *
 * `title` é curto de propósito: o tooltip repete o rótulo, enquanto o
 * `ariaLabel` carrega a instrução inteira para quem depende dele.
 */
const COPY_LABELS: Record<
  CopyState,
  { short: string; icon: LucideIcon; title: string; ariaLabel: string; announce: string }
> = {
  idle: { short: 'Copy', icon: Copy, title: 'Copy code', ariaLabel: 'Copy code', announce: '' },
  copied: {
    short: 'Copied',
    icon: Check,
    title: 'Code copied',
    ariaLabel: 'Code copied',
    announce: 'Code copied to clipboard',
  },
  manual: {
    short: 'Press ⌘C',
    icon: Copy,
    title: 'Press Ctrl+C or Cmd+C to copy',
    ariaLabel: 'Could not copy automatically — the code is selected, press Ctrl+C or Cmd+C',
    announce: 'Could not copy automatically. The code is selected — press Ctrl+C or Cmd+C.',
  },
  select: {
    short: 'Press ⌘C',
    icon: Copy,
    title: 'Select the code and press Ctrl+C or Cmd+C',
    ariaLabel: 'Could not copy automatically — select the code and press Ctrl+C or Cmd+C',
    announce: 'Could not copy automatically. Select the code and press Ctrl+C or Cmd+C.',
  },
};

function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const language = node.attrs.language as string | null;
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const preRef = useRef<HTMLPreElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function flash(state: Exclude<CopyState, 'idle'>) {
    setCopyState(state);
    if (timer.current) clearTimeout(timer.current);
    const ms = state === 'copied' ? FEEDBACK_MS : INSTRUCTION_MS;
    timer.current = setTimeout(() => setCopyState('idle'), ms);
  }

  /**
   * Seleciona o código no próprio bloco, para o ⌘C/Ctrl+C do leitor pegar.
   * Devolve `false` quando não selecionou, para o rótulo não prometer uma
   * seleção que não existe.
   *
   * **Só no público.** Este NodeView é o mesmo do editor admin, e o `<code>`
   * daqui é o `contentDOM` do ProseMirror: mexer na seleção do DOM faz o PM
   * sincronizar uma `TextSelection` do bloco inteiro, descartando o cursor do
   * autor — a próxima tecla substituiria o código todo. Em modo editável o
   * autor seleciona à mão; o campo já é dele.
   */
  function selectCode() {
    if (editor.isEditable) return false;
    const code = preRef.current?.querySelector('code');
    if (!code) return false;
    const range = document.createRange();
    range.selectNodeContents(code);
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function copy() {
    // `node.textContent` é o texto do documento, não o do DOM: as classes
    // `hljs-*` do lowlight são decorations e não acrescentam nem um caractere,
    // então o que vai para a área de transferência é exatamente o que o autor
    // escreveu — quebras de linha e indentação incluídas.
    void copyText(node.textContent).then((ok) => {
      if (ok) {
        flash('copied');
        return;
      }
      flash(selectCode() ? 'manual' : 'select');
    });
  }

  const copied = copyState === 'copied';
  const labels = COPY_LABELS[copyState];
  const Icon = labels.icon;

  return (
    <NodeViewWrapper className="sb-code-block" data-language={language ?? undefined}>
      <div className="sb-code-head" contentEditable={false}>
        {editor.isEditable ? (
          <select
            className="sb-code-lang-select"
            aria-label="Code language"
            value={language ?? PLAIN}
            onChange={(e) =>
              updateAttributes({ language: e.target.value === PLAIN ? null : e.target.value })
            }
          >
            <option value={PLAIN}>Plain text</option>
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="sb-code-lang">{labelFor(language) ?? ''}</span>
        )}
        <button
          type="button"
          className="sb-code-copy"
          onClick={copy}
          data-copied={copied || undefined}
          data-copy-manual={copyState === 'manual' || copyState === 'select' || undefined}
          aria-label={labels.ariaLabel}
          title={labels.title}
        >
          <Icon aria-hidden size={14} />
          <span>{labels.short}</span>
        </button>
      </div>
      {/* `aria-live`: o rótulo do botão muda, mas quem acionou por teclado ou
          leitor de tela não é notificado da troca sem uma região viva.

          `contentEditable={false}` como no `sb-code-head` acima: sem ele o span
          é editável dentro do NodeView (medido: `isContentEditable === true` no
          editor admin), virando um nó que o cursor alcança e que o observador de
          DOM do ProseMirror pode ler de volta para o documento. */}
      <span className="sr-only" role="status" aria-live="polite" contentEditable={false}>
        {labels.announce}
      </span>
      <pre ref={preRef}>
        {/* Argumento de tipo explícito: `as` é `NoInfer<T>` e o default do
            componente é 'div' — sem ele o TS rejeita "code". */}
        <NodeViewContent<'code'> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({
  lowlight,
  // Sem `defaultLanguage` o plugin cai em `lowlight.highlightAuto` para todo
  // bloco sem linguagem — texto puro (saída de terminal, tabela ASCII) sai
  // colorido ao acaso, e o bloco fica sem label explicando de onde veio a cor.
  // `plaintext` mantém "Plain text" literalmente plano até o autor escolher.
  defaultLanguage: 'plaintext',
});
