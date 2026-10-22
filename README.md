# v-flix

App Android pessoal, estilo Netflix, que reúne num só lugar os **filmes** disponíveis por assinatura no **Brasil** em **Netflix, Prime Video, Disney+ e HBO Max** (padrão; outros 11 serviços, como Globoplay, MUBI e Apple TV, podem ser ligados nas Configurações). Cada filme vem com a **nota do IMDb** e o **Oscar** (Melhor Filme, Filme Internacional e Roteiro, indicado/vencedor), orçamento e bilheteria, e pode ser filtrado por gênero, país, serviço, nota, votos, ano e Oscar.

Não há backend: o próprio celular baixa os dados, cruza as fontes e guarda tudo num SQLite local. O plano completo está em [`plan.md`](plan.md).

## Como funciona

```
 Botão "Sincronizar"
        │
        ▼
 ┌──────────────────────────────── sincronização (no celular) ───────────────────────────────┐
 │ 1. Provedores, gêneros, países ── TMDB                                                     │
 │ 2. Disponibilidade ────────────── TMDB /discover (por serviço, fatiado por data se > 10k)  │
 │ 3. Detalhes (incremental) ─────── TMDB /movie/{id} (só filmes novos, 8 em paralelo)        │
 │ 4. Notas IMDb ─────────────────── datasets.imdbws.com/title.ratings.tsv.gz (streaming)     │
 │ 5. Oscar (4 categorias) ──────── Wikidata SPARQL (no máximo a cada 30 dias)               │
 └────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                              ▼
                                     SQLite local (vflix.db)
                                              │
                         Início (fileiras) · Explorar (filtros → SQL) · Detalhe
```

- A sincronização é **manual** e roda com a tela ligada (`expo-keep-awake`). Nada roda em segundo plano.
- Cada etapa é **retomável**: se cair no meio, a próxima execução continua de onde parou. Na etapa 3, por exemplo, só são buscados os filmes com `details_fetched_at IS NULL`.
- A tabela `movie_provider` é **substituída inteira** a cada sync. Um filme que sai do catálogo deixa de aparecer nas telas, mas seus detalhes ficam guardados para quando ele voltar.
- O cruzamento entre as fontes usa o `imdb_id`, que vem do TMDB (`external_ids`).

## Arquitetura

| Camada | Tecnologia |
|---|---|
| App | React Native + Expo SDK 58 + TypeScript, roda no Expo Go |
| Navegação | expo-router (rotas por arquivo em `src/app/`) |
| Banco | expo-sqlite, migrações versionadas via `PRAGMA user_version` |
| Rede | `fetch` com retry e backoff exponencial (429/5xx/falha de rede) |
| Arquivos e gzip | expo-file-system + pako (descompactação em chunks) |
| UI | `StyleSheet` + tema próprio, expo-image para pôsteres |

### Estrutura de pastas

```
src/
  app/            # telas (expo-router): cada arquivo é uma rota, _layout.tsx define o navegador
    (tabs)/       # abas Início e Explorar
  api/            # fetchWithRetry, cliente da TMDB
  components/     # PosterCard, Chip/Segmented
  db/             # migrações, consultas, configurações do usuário
  explore/        # estado dos filtros (zustand) e filtros → SQL
  home/           # fileiras da Início (cada uma é um conjunto de filtros do Explorar)
  lib/            # formatação e normalização de busca
  sync/           # etapas da sincronização (uma por arquivo)
  theme/          # cores, espaçamentos, tipografia
```

Código que não é tela fica fora de `src/app/`.

### Banco de dados

Tabelas principais: `movie`, `provider`, `genre`, `country`, as tabelas de ligação `movie_genre`, `movie_country`, `movie_provider` e `movie_recommendation`, além de `imdb_rating`, `oscar_award`, `watched`, `watchlist`, `app_setting` e `sync_meta` (data e contagens da última sync).

Para mudar o esquema, **acrescente** uma nova entrada ao fim do array `MIGRATIONS` em `src/db/migrations.ts`. Nunca edite uma migração que já foi aplicada.

## Desenvolvimento

### Pré-requisitos

- Node **≥ 22.13** (o projeto fixa a versão em `.nvmrc`; com nvm, rode `nvm use`)
- App **Expo Go** no Android, na versão compatível com o SDK 58
- Um token de leitura da TMDB: em themoviedb.org, abra **Settings → API** e copie o **API Read Access Token** (a string longa `eyJ...`, não a "API Key")

### Primeiros passos

```bash
nvm use
npm install
cp .env.example .env    # e preencha EXPO_PUBLIC_TMDB_TOKEN
npx expo start          # escaneie o QR code com o Expo Go
```

Celular e computador precisam estar na mesma rede. Se não estiverem, use `npx expo start --tunnel`.

### Comandos úteis

```bash
npx expo install <pacote>   # use sempre este em vez de npm install: escolhe versões compatíveis com o SDK
npx tsc --noEmit            # typecheck
npx expo lint               # lint
npx expo-doctor             # diagnostica dependências e configuração
```

### Regras

- Só use bibliotecas que rodem no **Expo Go**, sem módulos nativos customizados.
- A API do Expo muda a cada SDK. Consulte a doc da versão em uso: https://docs.expo.dev/versions/v58.0.0/
- O token fica exposto no bundle (`EXPO_PUBLIC_*`). Isso é aceitável porque o app é só para uso pessoal e não vai para loja.
- Para zerar os dados durante o desenvolvimento, limpe os dados do Expo Go ou apague o `vflix.db`.

### Dump inicial

Para a primeira instalação não começar do zero (~10 min de sync no celular), o app traz um banco pronto em `assets/db/vflix.db`. Ele é copiado só quando o banco ainda não existe; depois disso, o botão "Sincronizar" busca só o que mudou.

```bash
nvm use
make dump         # atualiza o dump a partir do atual (~1 min)
make dump-fresh   # gera do zero (~10 min)
```

O script (`scripts/dump.ts`) roda as mesmas etapas de `src/sync/` no Node, com um adaptador de `node:sqlite` para a API do expo-sqlite (`scripts/node-sqlite.ts`). O dump usa os 4 serviços padrão e sai sem dados do usuário (vistos, Minha lista, configurações). Regere antes de cada build do APK e depois de mudanças no esquema.

### Build do APK

> Ainda não configurado. Será adicionado no passo 9 do plano (`eas.json` com o perfil `preview`).

```bash
npx eas-cli@latest build -p android --profile preview
```

## Créditos

- Dados de disponibilidade: JustWatch (via TMDB)
- Este produto usa a API da TMDB, mas não é endossado nem certificado pela TMDB
- Notas: IMDb datasets (uso pessoal e não comercial)
- Oscar: Wikidata
