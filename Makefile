# Banco embutido no app para a primeira instalação (ver scripts/dump.ts).
# Requer Node >= 22.13 (`nvm use`) e EXPO_PUBLIC_TMDB_TOKEN no .env.

TSX = npx tsx --env-file=.env --tsconfig tsconfig.json

.PHONY: dump dump-fresh icons

## Atualiza assets/db/vflix.db a partir do dump atual (só busca o que mudou)
dump:
	$(TSX) scripts/dump.ts

## Gera o dump do zero (~10 min)
dump-fresh:
	$(TSX) scripts/dump.ts --fresh

## Regera os ícones em assets/images/ (requer Pillow)
icons:
	python3 scripts/icons.py
