# Backup e recuperação (responsabilidade do operador)

> **O SystemBook não faz backup automático.** Todo o estado — usuários, conteúdo,
> revisões, tokens — vive num **único arquivo SQLite** (`DATABASE_PATH`, por padrão
> `/app/data/systembook.db`), junto dos artefatos de preview em `/app/data/previews`,
> no volume `systembook-data`. Fazer backup e ter um plano de recuperação de
> desastre é **responsabilidade do time que hospeda a instância**. Isso é uma
> fronteira de escopo deliberada do MVP: a plataforma não embute replicação nem
> agendamento de backup.

## O risco, em termos diretos

Se o volume `systembook-data` for perdido (disco corrompido, `docker volume rm`
acidental, host descartado) **sem uma cópia em outro lugar, os dados somem** — não
há como recuperar. Um único arquivo é fácil de copiar, mas também é um único ponto
de falha. Você precisa de uma cópia **fora do host**.

Qualquer estratégia serve (um `cp` agendado do arquivo `.db` para outro storage já é
melhor que nada), mas a recomendação abaixo — **Litestream** — dá replicação
contínua com perda de dados próxima de zero, sem exigir nenhuma mudança no código do
SystemBook.

## Por que Litestream funciona aqui

[Litestream](https://litestream.io) replica um banco SQLite observando o arquivo no
disco (e seu WAL) e enviando as mudanças para um destino remoto — tipicamente um
bucket S3-compatível. Ele não precisa de integração com a aplicação: roda como um
processo separado que aponta para o mesmo arquivo.

O SystemBook abre o banco em **modo WAL** (`journal_mode = WAL`, em
`apps/server/src/db/client.ts`), que é exatamente o que o Litestream exige — então
funciona sem nenhum ajuste. Basta rodar o Litestream como um **sidecar** que
compartilha o volume `systembook-data`.

## Configuração — sidecar Litestream no compose de produção

### 1. `litestream.yml`

Crie um `litestream.yml` ao lado do seu `.env` e do `docker-compose.production.yml`.
Este exemplo replica o banco para um bucket S3-compatível:

```yaml
# litestream.yml
dbs:
  - path: /app/data/systembook.db
    replicas:
      - type: s3
        bucket: SEU-BUCKET            # <- substitua
        path: systembook              # prefixo (pasta) dentro do bucket
        region: us-east-1             # <- ajuste
        # Para S3-compatível (MinIO, Backblaze B2, Cloudflare R2, etc.),
        # descomente e aponte para o endpoint do provedor:
        # endpoint: https://s3.us-west-000.backblazeb2.com
```

As credenciais **não** ficam no arquivo — passe por variáveis de ambiente
(placeholders, troque pelos valores reais):

```
# adicione ao seu .env (NÃO commitado)
LITESTREAM_ACCESS_KEY_ID=coloque-sua-access-key
LITESTREAM_SECRET_ACCESS_KEY=coloque-sua-secret-key
```

> **Alternativa mínima (sem nuvem):** para replicar apenas para um segundo diretório
> no mesmo host (proteção contra corrupção do arquivo, **não** contra perda do host),
> troque o bloco `replicas` por `- type: file` e `path: /backup/systembook.db`,
> montando um segundo volume/host-path em `/backup`. É melhor que nada, mas uma cópia
> fora do host é o que realmente protege contra desastre.

### 2. Adicionar o sidecar ao compose

Estenda o `docker-compose.production.yml` (TASK-59) com um serviço `litestream` que
**compartilha o mesmo volume** `systembook-data` (para enxergar o arquivo `.db`) e
monta o `litestream.yml`:

```yaml
  litestream:
    image: litestream/litestream:0.3
    restart: unless-stopped
    # Sobe junto com o app; ambos acessam o mesmo arquivo SQLite pelo volume.
    depends_on:
      - app
    volumes:
      - systembook-data:/app/data                       # mesmo volume do app
      - ./litestream.yml:/etc/litestream.yml:ro          # config (somente leitura)
    environment:
      - LITESTREAM_ACCESS_KEY_ID=${LITESTREAM_ACCESS_KEY_ID}
      - LITESTREAM_SECRET_ACCESS_KEY=${LITESTREAM_SECRET_ACCESS_KEY}
    command: replicate -config /etc/litestream.yml
```

O volume `systembook-data` já é declarado no `docker-compose.production.yml`; o
sidecar apenas o reusa. Suba tudo com:

```bash
docker compose -f docker-compose.production.yml up -d
```

Confira que o Litestream está replicando:

```bash
docker compose -f docker-compose.production.yml logs -f litestream
# procure por linhas "replicating to" / geração de snapshots sem erro
```

## Procedimento de restauração

Restaurar recupera o arquivo `.db` do destino remoto **para um volume vazio, antes
de subir o container do SystemBook** (o app não deve estar escrevendo no arquivo
durante o restore).

1. **Garanta um volume vazio.** Numa instância nova, o volume `systembook-data` já
   está vazio. Se estiver recuperando no mesmo host após uma perda, recrie o volume:

   ```bash
   docker compose -f docker-compose.production.yml down
   docker volume rm <projeto>_systembook-data   # confira o nome com: docker volume ls
   docker compose -f docker-compose.production.yml up -d --no-start
   ```

2. **Restaure o banco** com o mesmo `litestream.yml` e as mesmas credenciais,
   escrevendo no arquivo dentro do volume. Rode o Litestream one-shot montando o
   volume:

   ```bash
   docker run --rm \
     -v <projeto>_systembook-data:/app/data \
     -v "$PWD/litestream.yml:/etc/litestream.yml:ro" \
     -e LITESTREAM_ACCESS_KEY_ID="$LITESTREAM_ACCESS_KEY_ID" \
     -e LITESTREAM_SECRET_ACCESS_KEY="$LITESTREAM_SECRET_ACCESS_KEY" \
     litestream/litestream:0.3 \
     restore -config /etc/litestream.yml /app/data/systembook.db
   ```

   (Sem o sidecar/compose, o equivalente direto é
   `litestream restore -o /app/data/systembook.db "s3://SEU-BUCKET/systembook"`.)

3. **Suba a instância.** Com o `.db` recuperado no volume, inicie normalmente:

   ```bash
   docker compose -f docker-compose.production.yml up -d
   ```

   As migrations rodam no boot e são idempotentes; o admin de bootstrap **não** é
   recriado porque o banco não está mais vazio. Faça login e confira o conteúdo.

> **Nota sobre os artefatos de preview:** os arquivos em `/app/data/previews` **não**
> são cobertos pelo Litestream (ele replica só o SQLite). Eles são reproduzíveis — o
> CI do time consumidor os republica no próximo push (veja
> [o guia de CI](./ci-example.md)). Se quiser recuperá-los sem esperar um novo push,
> inclua `/app/data/previews` numa cópia de volume separada.

## Antes de ir para produção

Teste o restore **antes** de precisar dele: suba uma instância descartável, gere
algum conteúdo, force um restore num volume limpo e confirme que os dados voltam. Um
backup nunca testado não é um backup.

Veja também: [guia de setup](./setup.md) · [README](../README.md).
