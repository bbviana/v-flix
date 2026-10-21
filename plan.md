# Plano: app agregador de filmes (Android, uso pessoal)

## Objetivo

App Android estilo Netflix que agrega os **filmes** (sem séries) disponíveis por assinatura no **Brasil** em **Netflix, Prime Video, Disney+ e HBO Max**. Cada filme é enriquecido com a **nota do IMDb** e a informação de **Oscar de Melhor Filme** (indicado/vencedor). O usuário navega por fileiras e filtra por gênero, país, serviço, nota, número de votos e Oscar.

## Restrições

- **Uso pessoal.** Sem publicação em loja e sem preocupação com exposição da chave de API.
- **Sem backend.** Toda a ingestão roda no próprio celular e os dados ficam num SQLite local.
- **Sincronização manual**, disparada por um botão "Sincronizar". Nada roda em segundo plano nem é agendado.
- **Funcionar no Expo Go** durante o desenvolvimento, sem módulos nativos customizados. O APK final sai pelo EAS Build.

## Stack

- React Native + **Expo** (SDK estável mais recente) + **TypeScript**
- Navegação: **expo-router**
- Banco: **expo-sqlite**
- Download de arquivos: **expo-file-system**
- Descompactação gzip: **pako**, em modo streaming/chunked
- Imagens: **expo-image**, carregando pôsteres de `https://image.tmdb.org/t/p/w342{poster_path}` (sem chave)
- Manter a tela ligada durante a sincronização: **expo-keep-awake**
- Configuração: `.env` com `EXPO_PUBLIC_TMDB_TOKEN`, um token de leitura v4 da TMDB enviado como `Authorization: Bearer`

> Consulte a documentação atual do Expo SDK em uso. A API do `expo-file-system` mudou nas versões recentes.

## Fontes de dados

| Dado | Fonte | Como |
|---|---|---|
| Lista de filmes por serviço | TMDB `/discover/movie` | `watch_region=BR`, `with_watch_monetization_types=flatrate`, `with_watch_providers=<id>` |
| Metadados (gênero, país, sinopse, pôster etc.) | TMDB `/movie/{id}` | `language=pt-BR&append_to_response=external_ids,credits,release_dates` |
| Nota e votos IMDb | Dataset oficial `https://datasets.imdbws.com/title.ratings.tsv.gz` | Download, descompactação em streaming e cruzamento por `imdb_id` |
| Oscar de Melhor Filme | Wikidata SPARQL `https://query.wikidata.org/sparql` | Uma única query, cruzamento por `imdb_id` (P345) |

### IDs dos provedores

Não use IDs fixos. Na sincronização, chame `/watch/providers/movie?watch_region=BR` e localize os 4 serviços pelo nome (Netflix, Amazon Prime Video, Disney Plus, Max/HBO Max). Valores esperados (Netflix=8, Prime=119, Disney+=337), mas o ID do HBO Max mudou com os rebrands. Grave os IDs na tabela `provider`.

## Esquema SQLite

```sql
CREATE TABLE provider (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  logo_path TEXT
);

CREATE TABLE movie (
  tmdb_id INTEGER PRIMARY KEY,
  imdb_id TEXT,
  title TEXT NOT NULL,            -- título em pt-BR
  original_title TEXT,
  overview TEXT,
  release_date TEXT,
  year INTEGER,
  runtime INTEGER,
  original_language TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  popularity REAL,
  certification_br TEXT,          -- de release_dates, iso_3166_1 = 'BR'
  director TEXT,
  top_cast TEXT,                  -- JSON com até 5 nomes
  details_fetched_at TEXT         -- NULL = detalhes ainda não buscados
);
CREATE INDEX idx_movie_imdb ON movie(imdb_id);

CREATE TABLE genre (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE movie_genre (tmdb_id INTEGER, genre_id INTEGER, PRIMARY KEY (tmdb_id, genre_id));
CREATE TABLE movie_country (tmdb_id INTEGER, iso TEXT, PRIMARY KEY (tmdb_id, iso)); -- production_countries
CREATE TABLE movie_provider (tmdb_id INTEGER, provider_id INTEGER, PRIMARY KEY (tmdb_id, provider_id));

CREATE TABLE imdb_rating (
  imdb_id TEXT PRIMARY KEY,
  rating REAL NOT NULL,
  votes INTEGER NOT NULL
);

CREATE TABLE oscar_best_picture (
  imdb_id TEXT PRIMARY KEY,
  year INTEGER,
  won INTEGER NOT NULL            -- 0/1
);

CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);  -- última sync de cada etapa, contagens
```

Use migrações versionadas (`PRAGMA user_version`).

## Sincronização (botão "Sincronizar")

Uma tela mostra o progresso de cada etapa (texto e barra) e mantém a tela ligada. Cada etapa precisa ser resiliente: se falhar no meio, a próxima execução retoma de onde parou.

1. **Provedores e gêneros:** busca `/watch/providers/movie?watch_region=BR` e `/genre/movie/list?language=pt-BR` e faz upsert.
2. **Disponibilidade (discover):**
   - Para cada um dos 4 provedores, pagina `/discover/movie` até o fim, juntando `tmdb_id`s.
   - O `discover` para em **500 páginas (10.000 resultados)**. Se `total_results > 10000` para um provedor, fatie por faixa de `primary_release_date.gte/lte` (ex.: por década ou ano) até cada fatia ficar abaixo do limite.
   - Ao final, **substitui** a tabela `movie_provider` inteira numa transação, para que filmes que saíram do catálogo deixem de aparecer.
   - Insere linhas mínimas em `movie` (id, título, pôster, ano, popularidade) para ids novos.
3. **Detalhes (incremental):** para cada `movie` com `details_fetched_at IS NULL`, chama `/movie/{id}` com o `append_to_response` acima e preenche `imdb_id`, gêneros, países, diretor, elenco e classificação BR.
   - Use concorrência limitada (~8 requisições simultâneas) com retry e backoff em HTTP 429/5xx.
   - Grave em lotes, numa transação a cada ~100 filmes.
   - A primeira sincronização faz alguns milhares de chamadas (minutos). As seguintes buscam só os filmes novos.
4. **Notas IMDb:**
   - Baixa `title.ratings.tsv.gz` (alguns MB) para o cache.
   - Descompacta em chunks com `pako.Inflate` e parseia linha a linha (`tconst\taverageRating\tnumVotes`). **Não carregue o arquivo descompactado inteiro numa string.**
   - Mantém só as linhas cujo `tconst` está no conjunto de `imdb_id`s do catálogo e substitui `imdb_rating` numa transação.
5. **Oscar de Melhor Filme (Wikidata):** uma requisição GET com header `Accept: application/sparql-results+json` e um `User-Agent` identificando o app (exigido pelo Wikidata).

   ```sparql
   SELECT ?imdb ?ano ?venceu WHERE {
     { ?f p:P166 ?st . ?st ps:P166 wd:Q102427 . BIND(true AS ?venceu) }
     UNION
     { ?f p:P1411 ?st . ?st ps:P1411 wd:Q102427 . BIND(false AS ?venceu) }
     ?f wdt:P345 ?imdb .
     OPTIONAL { ?st pq:P585 ?d . BIND(YEAR(?d) AS ?ano) }
   }
   ```

   - **Confirme que `Q102427` é o Oscar de Melhor Filme** antes de usar.
   - Consolide por `imdb_id` com `won = MAX(won)`: um vencedor pode aparecer como indicado e como vencedor.
   - Se o ano faltar, use o ano de lançamento do filme + 1.
   - Esta etapa pode ser pulada se já rodou nos últimos 30 dias.
6. Grava data/hora e contagens em `sync_meta` e mostra um resumo (total de filmes, por serviço, quantos com nota IMDb, quantos indicados ao Oscar).

## Telas

1. **Início (estilo Netflix):** fundo escuro e fileiras horizontais de pôsteres. Fileiras iniciais:
   - Vencedores do Oscar de Melhor Filme
   - Indicados ao Oscar
   - Nota IMDb 8+ (com votos ≥ 10.000)
   - Uma fileira por serviço (ordenada por nota IMDb)
   - Algumas fileiras por gênero

   Sem dados, mostra um estado vazio com botão para sincronizar.
2. **Explorar / Filtros:** grade de pôsteres com filtros combináveis:
   - Busca por título (pt-BR e original)
   - Serviço (multi)
   - Gênero (multi)
   - País de produção (multi, semântica "contém")
   - Nota IMDb mínima (slider)
   - Votos mínimos (padrão 1.000, para esconder filmes obscuros com poucas notas)
   - Ano (faixa)
   - Oscar: todos / indicados / vencedores
   - Ordenação: nota IMDb, popularidade, ano

   Os filtros viram uma query SQL.
3. **Detalhe do filme:** backdrop, título, ano, duração, classificação, gêneros, países, diretor, elenco, sinopse, nota IMDb com votos, selo do Oscar (indicado/vencedor + ano) e logos dos serviços onde está disponível. Inclua um rodapé obrigatório: "Dados de disponibilidade: JustWatch" e "Este produto usa a API da TMDB, mas não é endossado nem certificado pela TMDB".
4. **Sincronização:** botão, progresso por etapa, data da última sincronização e resumo.

## Ordem de implementação

1. Projeto Expo + TypeScript + expo-router, `.env` com o token, cliente HTTP da TMDB com retry/backoff, esquema SQLite com migração.
2. Tela de sincronização com as etapas 1 e 2 (provedores + discover). **Checkpoint:** mostrar quantos filmes há por serviço e no total.
3. Etapa 3 (detalhes incrementais).
4. Etapa 4 (notas IMDb).
5. Etapa 5 (Oscar via Wikidata).
6. Tela de Detalhe.
7. Tela Explorar com filtros.
8. Tela Início com fileiras.
9. `eas.json` com perfil `preview` gerando APK (`"android": { "buildType": "apk" }`) e instruções de build (`npx eas build -p android --profile preview`).

## Verificações

- Contagem por serviço plausível (ordem de milhares) e total único abaixo de ~20 mil.
- A maioria dos filmes tem `imdb_id` e nota IMDb. Registre quantos ficaram sem.
- *Parasita* (tt6751668) e *Oppenheimer* (tt15398776) aparecem em `oscar_best_picture` com `won = 1`. Um indicado não vencedor conhecido aparece com `won = 0`.
- Uma segunda sincronização busca detalhes apenas de filmes novos e termina bem mais rápido que a primeira.
- Filtros combinados respondem instantaneamente com o catálogo completo.
- O app funciona no Expo Go num Android.

## Fora do escopo (por enquanto)

Séries, outros prêmios (Globo de Ouro etc.), deep links para os apps dos serviços, sincronização automática/em segundo plano, backend, login.
