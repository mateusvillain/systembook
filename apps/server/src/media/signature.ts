/**
 * O `mime` declarado pelo cliente é o que voltamos no `Content-Type` do
 * serving, então confiar nele cegamente deixaria alguém servir HTML como se
 * fosse imagem, na nossa origem. A checagem de assinatura amarra o tipo
 * declarado ao conteúdo real. Serve ao logo (SYS-39) e às imagens do
 * conteúdo importado (SYS-112).
 */
export function contentMatchesMime(bytes: Buffer, mime: string): boolean {
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString('latin1');
  switch (mime) {
    case 'image/png':
      return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/gif':
      return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a';
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'image/avif':
      return ascii(4, 8) === 'ftyp' && /^avi[fs]$/.test(ascii(8, 12));
    case 'image/svg+xml': {
      // SVG é texto: exige que o primeiro elemento seja `<svg` ou um prólogo XML.
      const head = bytes.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
      return head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype svg');
    }
    default:
      return false;
  }
}
