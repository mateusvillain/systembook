# @systembook/preview-kit

Runtime de montagem dos previews do [SystemBook](https://github.com/mateusvillain/systembook).

Roda **dentro do iframe** de preview: monta a variante pedida e reage às
mudanças de props que o painel envia por `postMessage`. Na prática você não o
chama à mão — o [`@systembook/connector`](https://www.npmjs.com/package/@systembook/connector)
gera as entradas que o importam. Ele é uma dependência direta do connector; você
só o instala sozinho se estiver montando o harness por conta própria.

```ts
import { mount } from '@systembook/preview-kit';

const handle = mount(document.getElementById('root')!, Button, config, {
  variantId: 'primary',
});
```

`mount` devolve um handle com `unmount()`. A opção `allowedOrigin` restringe de
qual origin as mensagens são aceitas — sem ela, cai para a origin do
`document.referrer` e depois para a da própria janela.

`react` e `react-dom` são peer dependencies (^19): o preview usa o React do
**seu** repo, porque duas cópias de React quebrariam hooks.

Licença MIT.
