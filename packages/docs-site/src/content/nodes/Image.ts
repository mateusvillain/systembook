import { mergeAttributes, Node } from '@tiptap/core';

/**
 * Bloco de imagem (SYS-93). O tipo `image` existe no schema de blocos desde o
 * MVP (`ImageBlockContent`: `src`, `alt`, `caption`) e o mapeamento canônico
 * sempre o produziu, mas o conjunto de conteúdo não tinha o nó — uma imagem
 * não renderizava. Agora entra: o modo estático a produz a partir de
 * `![alt](src "legenda")`. Só renderização: o editor do CMS ainda não tem UI
 * para inserir imagem solta.
 */
export const Image = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      caption: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-image]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, alt, caption } = node.attrs as { src: string; alt: string; caption: string | null };
    const img = ['img', { src, alt, class: 'sb-image-img', loading: 'lazy' }] as const;
    return caption
      ? ['figure', mergeAttributes({ 'data-image': '', class: 'sb-image' }, HTMLAttributes), img, ['figcaption', { class: 'sb-image-caption' }, caption]]
      : ['figure', mergeAttributes({ 'data-image': '', class: 'sb-image' }, HTMLAttributes), img];
  },
});
