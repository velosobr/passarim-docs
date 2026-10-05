# Design do Passarim (etapa 4)

Sem Figma: tokens em JSON, logo em SVG e mockups em HTML exportados para PNG. Tudo versionado aqui.

## O que o app (etapa 5) consome

| Para | Use |
|---|---|
| Cores, tipografia, formas e espaços | [`tokens/TOKENS.md`](tokens/TOKENS.md) (gerado; inclui `Color.kt` pronto para colar) e `tokens/passarim-tokens.json` |
| Fonte | `mockups/fonts/manrope-latin-wght-normal.woff2` (Manrope variável, licença OFL em `OFL.txt`) → recursos de fonte do Compose |
| Ícone adaptativo | `icon/foreground.svg`, `background.svg`, `monochrome.svg` → Android Studio › *New › Vector Asset* (ou conversão para VectorDrawable) |
| Ícone da splash (Android 12+) | `icon/splash.svg` |
| Telas | `mockups/png/<tela>.<tema>.png` (referência visual; 16 telas × claro/escuro) |

As conservações (`LC`, `NT`, `VU`, `EN`, `CR`, `EW`) têm cor própria por tema; os rótulos em português estão em `TOKENS.md`.

## Telas

`splash` · `explorar` · `busca-ativa` · `explorar-vazio` · `filtros` · `detalhe` · `loading-explorar` · `loading-detalhe` · `favoritos` · `favoritos-vazio` · `configuracoes` · `dados-armazenamento` · `sobre` · `erro-sem-internet` · `erro-servidor` · `erro-nao-encontrada`

Os nomes de aves, nomes científicos, tamanhos, biomas, estados e as contagens do filtro vêm do catálogo (41 espécies). Fotos, gravações e créditos dos mockups são **ilustrativos**: fotos são placeholders e o crédito aparece na forma "autor · licença".

## Como regenerar

Requer Node ≥ 20.11 e Google Chrome. Em `tools/`:

```bash
npm install                 # uma vez
npm run build               # tokens → _base.css + TOKENS.md; fragmentos → páginas HTML
node export-png.mjs         # páginas → PNG (falha se houver texto cortado, rolagem horizontal ou fonte ausente)
node export-png.mjs --scale 1.3   # mesma verificação com fonte ampliada (PNGs em png/x1.3/, não versionados)
node export-icon-preview.mjs      # icon/preview-48dp.png (falha se a logo sair da zona segura de 66dp)
npm test                    # contraste, cores literais, arquivos gerados em dia, ícone (checagens estáticas; as de layout e zona segura rodam nos exports acima)
```

Para mudar uma cor: edite `tokens/passarim-tokens.json`, rode `node check-tokens.mjs` (contraste), `npm run build` e `node export-png.mjs`. Para mudar uma tela: edite `mockups/src/<tela>.html` (somente `var(--...)`, nunca cor literal) e repita o build e o export.
