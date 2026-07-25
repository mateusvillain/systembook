- Subtítulo opcional para a documentação. Note que em referencia.png, abaixo do título "Introduction" há um espaço para digitar o subtítulo.

- Note em referencia.png que o espaço para digitar a documentação não tem borda delimitando o espaço. Siga nessa mesma ideia, também removendo os botões de "Bold", "Italic" e outros, que devem ser controlados via atalho (Cmd+B, Cmd+I, etc), markdown, ou ao selecionar um texto, aparecendo uma pequena janela flutuante sobre o texto com essas opções de estilo como em referencia-4.png.

- A movimentação de textos por linha não deve ser via ação "Mover para cima" ou "Mover para baixo", e sim como drag and drop.

- Remova a interface de empty state criada na área do conteúdo da documentação, e substitua por um simples texto dizendo para o usuário começara digitar e que markdown também funciona, como em referencia-5.png.

- Permitir criar, editar, excluir e selecionar uma tag de status para a página que o usuário está digitando. Os status padrões (podem ser gerenciados) são: To do, In progress, Deprecated, Beta. Adicione uma nova página para gerenciar essas tags, e o menu dele deve ficar no menu do usuário. A posição dela na página deve ficar ao lado do tílo, onde hoje é exibido "Rascunho".

- Callouts não podem ser inseridos dentro de tables.

- Permitir que ao digitar "/", o mesmo dropdown de ações (Textos, Blocos, Listas, etc) apareça, mas permitindo que o usuário digite o nome do bloco (ex: /table para inserir uma tabela). Os nomes devem ser em inglês.

- Os controles de adicionar ou remover coluna e linha da tabela devem ser exibidos ao passar o mouse sobre a tabela (horizontalmente). A referencia-6.png tem um modelo simples, mas deve ser melhor e organizado, pois também é preciso controlar o tamanho das colunas (arrastando e soltando, etc), e identificar se a tabela deve ou não ter um cabeçalho (que possui um fundo cinza claro para destacar)

- Table não pode ser inserido dentro de outra table, e nem dentro de callouts.

- Tanto as páginas no header quanto as seções e páginas das seções devem permitir serem reorganizadas via drag and drop. O ícone de drag and drop deve aparecer somente no hover.

- No dropdown ao clicar no ícone de 3 pontos tanto nos menus no header quanto nas páginas nas seções, deve haver as ações de "Copiar link" para ver aquela página documentada, e não a versão CMS.

- No dropdown ao clicar no ícone de 3 pontos nas páginas das seções, deve haver um item para mover aquela página para outro menu (exibir apenas se houver dois menus ou mais).

- Mudar o idioma do produto de português para inglês (essa deve ser uma das últimas tasks, pois vamos adicionar/remover/mudar algumas coisas ao longo das outras tarefas).
