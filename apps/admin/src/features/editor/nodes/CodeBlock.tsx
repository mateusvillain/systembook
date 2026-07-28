import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
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

function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const language = node.attrs.language as string | null;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function copy() {
    void navigator.clipboard.writeText(node.textContent).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    });
  }

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
          aria-label={copied ? 'Code copied' : 'Copy code'}
        >
          {copied ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre>
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
}).configure({ lowlight });
