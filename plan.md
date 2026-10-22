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
   - ~~Uma fileira por serviço~~ (removida a pedido: sem fileiras por serviço)
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

1. ✅ Projeto Expo + TypeScript + expo-router, `.env` com o token, cliente HTTP da TMDB com retry/backoff, esquema SQLite com migração.
2. ✅ Tela de sincronização com as etapas 1 e 2 (provedores + discover). **Checkpoint:** mostrar quantos filmes há por serviço e no total.
3. ✅ Etapa 3 (detalhes incrementais).
4. ✅ Etapa 4 (notas IMDb).
5. ✅ Etapa 5 (Oscar via Wikidata).
6. ✅ Tela de Detalhe.
7. ✅ Tela Explorar com filtros.
8. ✅ Tela Início com fileiras.
9. `eas.json` com perfil `preview` gerando APK (`"android": { "buildType": "apk" }`) e instruções de build (`npx eas build -p android --profile preview`). **Adiado para o fim** (ver "Próximos passos").
10. **Dump inicial embutido no app:** um `Makefile` (ou Docker) roda a sincronização completa no computador, reaproveitando o código de `src/sync/` em Node com `node:sqlite` e um adaptador para a API do expo-sqlite. O resultado é um `.db` (compactado, se compensar) embutido como asset. Na primeira instalação, o app parte desse banco via `SQLiteProvider` `assetSource`, e o botão "Sincronizar" só busca o que mudou.

## Próximos passos

Ordem combinada depois do passo 8 (os números de feature referem-se a "Features futuras"):

1. ✅ Features 1 e 8 juntas: **marcar como visto** e **Minha lista** (mesmas tabelas do usuário, botões no Detalhe e filtros no Explorar).
2. ✅ Feature 2: **mais categorias do Oscar** (Filme Internacional; verificar Roteiro).
3. ✅ Feature 9: **orçamento e bilheteria**.
4. ✅ Feature 10: **recomendações**.
5. Feature 11: **escolher os serviços de streaming**.
6. Passo 10: **dump inicial embutido** (depois das mudanças de esquema acima, para não refazer o dump várias vezes).
7. Feature 6: **ícone do app**.
8. Feature 7: **filmes para locação** (aumenta o catálogo; regerar o dump depois).
9. Passo 9: **build do APK** (`eas.json`).

Sem posição definida: feature 12 (**séries**, com a Crunchyroll), feature 13 (**ocultar países**) e feature 14 (**clima e temas**).

## Verificações

- Contagem por serviço plausível (ordem de milhares) e total único abaixo de ~20 mil.
- A maioria dos filmes tem `imdb_id` e nota IMDb. Registre quantos ficaram sem.
- *Parasita* (tt6751668) e *Oppenheimer* (tt15398776) aparecem em `oscar_best_picture` com `won = 1`. Um indicado não vencedor conhecido aparece com `won = 0`.
- Uma segunda sincronização busca detalhes apenas de filmes novos e termina bem mais rápido que a primeira.
- Filtros combinados respondem instantaneamente com o catálogo completo.
- O app funciona no Expo Go num Android.

## Features futuras

1. **Marcar filme como visto.** ✅ Feito (junto com o item 8).
   - Botão no Detalhe para marcar e desmarcar. Os dados ficam numa tabela local (`watched (tmdb_id PRIMARY KEY, watched_at TEXT)`), que a sincronização nunca apaga.
   - Filtro no Explorar: todos / não vistos / vistos. Avaliar se as fileiras da Início devem esconder os já vistos.
   - Se o dump inicial (passo 10) substituir o banco numa reinstalação, a tabela `watched` precisa ser preservada.
2. **Mais categorias do Oscar.** ✅ Feito: Melhor Filme, Filme Internacional, Roteiro Original e Roteiro Adaptado na tabela `oscar_award`. O Wikidata é consultado por 4 consultas simples (vitória/indicação × prêmio no filme/na pessoa com P1686), ~1 s cada; uma consulta única com UNIONs levava ~2 min e estourava o limite de 60 s. Cobertura do roteiro: Original 425 filmes/85 vencedores, Adaptado 472/97. Generalizar `oscar_best_picture` para uma tabela de prêmios com categoria (`oscar_award (imdb_id, category, year, won)`) e permitir filtrar e exibir cada categoria.
   - **Melhor Filme Internacional** (antes "em Língua Estrangeira"), `Q105304`. **Viável, já verificado** com a mesma consulta usada para Melhor Filme: 342 filmes, 71 vencedores, todos os anos de 1957 a 2026 cobertos (22 no catálogo atual, como Roma, Parasita e Zona de Interesse). O prêmio é oficialmente do país, mas no Wikidata está ligado ao filme.
   - **Melhor Roteiro Original** (`Q41417`) **e Adaptado** (`Q107258`). **Viabilidade a verificar.** Risco: esses prêmios costumam ser atribuídos aos **roteiristas** (pessoas), não ao filme, então a consulta via P166/P1411 no filme pode trazer pouca coisa. Checar a cobertura comparando com a lista real de vencedores, e investigar o qualificador "for work" (P1686) nas declarações dos roteiristas como alternativa.
   - Uma única consulta SPARQL pode trazer todas as categorias (`VALUES ?premio { wd:Q102427 wd:Q105304 ... }`).
3. **Ícone do Oscar nos pôsteres.** ✅ Feito (reflete a melhor situação em qualquer categoria).
   - Vencedores: ícone de troféu **preenchido** sobre o pôster (em grades e fileiras).
   - Indicados não vencedores: o mesmo ícone, **só o contorno**.
   - Com várias categorias, o ícone reflete a melhor situação do filme (venceu alguma > indicado a alguma); o detalhe por categoria fica na tela do filme.
   - Discreto, num canto do pôster, seguindo a diretriz visual clean.
4. **Nota IMDb no card do filme.** ✅ Feito no passo 8.
   - Mostrar a nota (ex.: "8,5") nos pôsteres das grades e fileiras. Filmes sem nota não mostram nada.
   - Desenhar junto com o ícone do Oscar (item 3), para os dois não competirem: por exemplo, a nota num canto inferior e o troféu no superior, em selos pequenos e semitransparentes que não cubram o pôster.
   - A consulta do Explorar já traz `rating`; falta incluir nas fileiras da Início e no `PosterCard`.

5. **Bandeiras dos países no Detalhe.** ✅ Feito.
   - Linha própria abaixo de "ano · duração", com todos os países de produção: "🇩🇪 Alemanha  ·  🇫🇷 França".
   - Bandeira como emoji gerado a partir do código ISO; países históricos sem emoji (União Soviética, Tchecoslováquia…) mostram só o nome, traduzido.
   - A linha "País" saiu da ficha técnica.

6. **Ícone do app.**
   - Hoje o app usa os ícones padrão do template do Expo (`assets/images/`).
   - Criar um ícone próprio seguindo a diretriz visual (clean, elegante), e a splash screen combinando.
   - Android usa ícone adaptativo: `android-icon-foreground.png`, `android-icon-background.png` e `android-icon-monochrome.png` (ícones temáticos do Android 13+), mais `icon.png` (1024×1024) e `splash-icon.png`. Configurados em `app.json`.
   - Fazer antes do build do APK (passo 9) ficar definitivo, já que o ícone vai no APK.

7. **Filmes disponíveis para locação.**
   - **Viável, já medido** (out/2026): 16.404 filmes para alugar no BR, quase todos na Apple TV Store (12.033), Amazon Video (9.996) e Claro video (3.202). Numa amostra, só ~20% já estão nos serviços de assinatura: **o catálogo iria de ~13 mil para ~26 mil**.
   - Impacto: a 1ª sincronização vai de ~9 min/~90 MB para ~18 min/~165 MB (o dump inicial do passo 10 absorve isso); banco de ~12 para ~24 MB; filtros continuam instantâneos.
   - Esquema: `movie_provider` ganha o tipo de acesso (`flatrate` / `rent`). A etapa de disponibilidade busca também as lojas escolhidas; a Apple TV passa de 10 mil e usa o fatiamento por data.
   - UX: o padrão continua **só assinatura** (Início e Explorar). Aluguel aparece num filtro do Explorar ("Assinatura / Aluguel / Todos") e no Detalhe ("Para alugar em …"). O usuário escolhe nas Configurações quais lojas entram.
   - A TMDB não informa **preço**: o app mostra onde alugar, não quanto custa.

8. **Minha lista (filmes que pretendo ver).** ✅ Feito: marcar como visto tira o filme da lista automaticamente; opção "Esconder filmes vistos" na Início (padrão: desligada).
   - Botão no Detalhe para adicionar e remover ("+ Minha lista" / "✓ Na lista").
   - Tabela local `watchlist (tmdb_id PRIMARY KEY, added_at TEXT)`, que a sincronização nunca apaga e que o dump inicial (passo 10) preserva. Mesmo tratamento da tabela `watched` (item 1).
   - Fileira **"Minha lista"** no topo da Início (só aparece se houver filmes), mais recentes primeiro, e filtro no Explorar.
   - Filme que sai de todos os catálogos continua na lista, marcado como indisponível, em vez de sumir.
   - Integração com o item 1: ao marcar um filme como visto, oferecer tirá-lo da lista (ou tirar automaticamente).

9. ✅ **Orçamento e bilheteria no Detalhe.**
   - `budget` e `revenue` já vêm na resposta de `/movie/{id}` que baixamos; basta guardar (novas colunas em `movie`) e exibir na ficha técnica ("Orçamento US$ 11 mi · Bilheteria US$ 258 mi").
   - A TMDB usa `0` para desconhecido: nesse caso, omitir.
   - Filmes já sincronizados precisam rebuscar detalhes para preencher (ou aceitar que só os novos terão o dado até um refresh).
10. ✅ **Recomendações ("Se gostou, veja também").**
    - Acrescentar `recommendations` ao `append_to_response` dos detalhes (mesma chamada, payload maior). Guardar a relação numa tabela `movie_recommendation (tmdb_id, recommended_id, rank)`.
    - No Detalhe, uma fileira com as recomendações **que estão no catálogo** (as de fora não são assistíveis).
    - Combina com a "Minha lista" (item 8): adicionar direto da fileira.

11. **Escolher os serviços de streaming.**
    - Hoje o app acompanha 4 serviços fixos (Netflix, Prime Video, Disney+, HBO Max). Permitir escolher quais usar, numa seção das Configurações.
    - Opções: os serviços de assinatura disponíveis no BR segundo a TMDB (ex.: Apple TV+, Paramount+, Globoplay, MUBI, Looke, Claro video…), com os 4 atuais marcados por padrão. A Crunchyroll fica para o suporte a séries (feature 12).
    - A etapa 1 da sincronização deixa de exigir os 4 nomes fixos: grava todos os provedores de assinatura do BR (nome e logo) e a etapa 2 busca só os escolhidos. Os nomes comerciais (Prime Video, Disney+) continuam vindo de um mapa de apelidos.
    - Desmarcar um serviço remove os filmes dele na próxima sincronização (ou imediatamente, filtrando as consultas pelos serviços escolhidos).
    - Mais serviços aumentam o catálogo: todos os serviços de assinatura do BR somam ~20 mil filmes, contra ~13 mil hoje.

12. **Suporte a séries.**
    - Hoje o app é só de filmes. Acrescentar séries usando os equivalentes da TMDB: `/discover/tv` (mesmos filtros de região, monetização e provedor), `/tv/{id}` com `external_ids,aggregate_credits,content_ratings`.
    - Notas do IMDb: o mesmo `title.ratings.tsv.gz` já cobre séries (por `imdb_id`), sem download extra.
    - Esquema: tabela própria (`show`) ou uma coluna de tipo em `movie` (renomeada para algo como `title`). Séries têm temporadas, episódios e datas de início/fim em vez de duração e ano único.
    - UI: alternar Filmes / Séries no Explorar e fileiras próprias na Início. Prêmios: o Oscar não se aplica (Emmy ficaria para depois).
    - **Crunchyroll entra junto com séries:** o catálogo dela é quase todo de séries de anime (só 153 filmes no BR, medido em out/2026), então só vale a pena com suporte a séries.

13. **Ocultar filmes de países escolhidos.**
    - Motivação: muitos filmes indianos geram ruído. Nova seção nas Configurações, "Países ocultos", com a lista de países do catálogo (mais frequentes primeiro) para marcar.
    - **Regra: ocultar só se todos os países de produção do filme estiverem na lista.** Medido em out/2026: 1.114 filmes têm a Índia, 1.046 são só indianos. Os outros 68 são coproduções como *1917*, *Pixels* e *The Post*, em que a Índia aparece por participação de empresas indianas; com a regra "algum país", eles sumiriam indevidamente.
    - **Opção "Sem país"** na mesma lista: marcada, oculta também os filmes sem país de produção cadastrado (744 no catálogo em out/2026).
    - Vale para todo o app: fileiras da Início, Explorar (resultados e contagens) e opções de filtro. No Explorar, uma nota discreta ("1.046 filmes ocultos pelas configurações") evita confusão.
    - Implementação: guardar em `app_setting` e aplicar em `buildWhere` como uma condição a mais: o filme aparece se tiver algum país fora da lista, ou se não tiver país e "Sem país" não estiver marcado.

14. **Clima e temas (tags curadas a partir das palavras-chave da TMDB).**
    - A TMDB tem palavras-chave por filme (`keywords`), mais específicas que gênero, incluindo palavras de clima (*audacious*, *bold*, *hopeful*, *inspirational*, *hilarious*, *mysterious*…) e temas (*time travel*, *based on true story*, *hero's journey*…).
    - Poréns, medidos em out/2026: **só em inglês**; cobertura desigual (filmes com 10 mil+ votos têm em média 10,5 e só 3% ficam sem nenhuma; no catálogo inteiro a média é 5 e 28% ficam sem nenhuma); termos livres, com repetições e ruído ("aftercreditsstinger").
    - Solução: uma **lista curada de ~30–50 tags em português**, cada uma agrupando várias palavras-chave em inglês. Ex.: Heroico (bravery, hero's journey, superhero, tragic hero), Emocionante (audacious, bold, frantic, race against time), Inspirador (inspirational, hopeful), Divertido (hilarious, amused, slapstick comedy), Sombrio (dark comedy, neo-noir, dark fantasy), Baseado em fatos reais (based on true story, biography), Baseado em livro (based on novel or book), Viagem no tempo (time travel, time warp).
    - Dados: acrescentar `keywords` ao `append_to_response` dos detalhes (sem chamadas extras). Guardar as palavras-chave brutas (`movie_keyword (tmdb_id, keyword_id)` + `keyword (id, name)`) e aplicar o mapa curado nas consultas, para poder ajustar as tags sem rebuscar. Os filmes já sincronizados precisam de uma passada extra (`/movie/{id}/keywords`, payload pequeno).
    - UI: filtro "Clima e temas" no Explorar; tags no Detalhe; possíveis fileiras na Início (ex.: "Inspiradores"). Filmes sem palavras-chave não aparecem nesses filtros.

## Fora do escopo (por enquanto)

Outros prêmios fora do Oscar (Globo de Ouro etc.; séries ficaram como feature 12), deep links para os apps dos serviços, sincronização automática/em segundo plano, backend, login.
