# Revisão de design — protótipo Stitch v1 (AvianDex)

Telas analisadas: splash, ícone, Explorar, Detalhes da espécie, Configurações, Erro.

## Problemas sistêmicos (valem para o app todo)

1. **Navegação inconsistente.** Explorar tem 3 abas (Explorar · Favoritos · Perfil); Configurações tem 4 abas (Início · Lista · Explorar · Configurações). Precisamos de uma única arquitetura de informação.
2. **Sem sistema de cor.** A marca é verde (splash, ícone), mas o Detalhe usa azul, o Erro usa roxo/índigo e o fundo varia entre preto puro (#000) e cinza-escuro. Proposta: verde da marca como cor primária, 1 cor de destaque, fundo "surface" único.
3. **Só existe tema escuro**, mas Configurações oferece "Modo Escuro" como opção. Ou desenhamos o tema claro, ou removemos a opção.
4. **Conteúdo placeholder quebrado** (nomes inventados como "Paralero", "Haréla", "Gavião-real" repetido em aves diferentes, texto sem sentido em Curiosidades). Normal em protótipo gerado por IA, mas esconde problemas reais de layout (nomes longos em PT quebram linha).

## Por tela

### Splash / Ícone
- Glow neon + textura de fundo não sobrevive em tamanhos pequenos (48dp no Android). Precisa de uma versão "flat" para o ícone adaptativo (camadas de frente/fundo separadas).
- Android 12+ (SplashScreen API) só permite ícone centralizado; o texto "AvianDex" abaixo não é suportado nativamente.
- Nome "AvianDex" (inglês, referência a Pokédex): bom para portfólio; avaliar se o público é brasileiro.

### Explorar
- Grade de 3 colunas deixa nomes em PT apertados ("Sabiá-laranjeira" quebra, "Aqudo-llimjo" corta). Sugestão: 2 colunas + nome científico em itálico.
- FAB "Identificar Pássaro" cobre o conteúdo do grid.
- Falta a busca com resultado/estado vazio e os **filtros por bioma/estado** (não aparecem em nenhuma tela).
- Coração em todos os cards compete visualmente com a foto; alvo de toque pequeno.

### Detalhes da espécie
- **Falta "Onde encontrar no Brasil"** (mapa/estados) — requisito central do produto.
- Falta nome científico, status de conservação (ex.: Arara-azul é "Vulnerável" — ótimo conteúdo), tamanho, botão de favoritar.
- Chips "Pantanal" e "Sementes" misturam bioma e dieta sem rótulo.
- Player de canto sem duração/progresso e **sem crédito do gravador** (obrigatório pela licença xeno-canto). Fotos também precisam de crédito.
- Galeria repete a mesma imagem.

### Configurações
- Sliders usados em "Sincronização" e "Idioma" são o controle errado (deveriam ser toggle e lista).
- "Tema Dinâmico" + "Modo Escuro" conflitam. Proposta: "Tema: Sistema / Claro / Escuro" + toggle "Cores dinâmicas (Android)".
- "Sobre" deve conter **créditos e licenças** das fotos/cantos.

### Erro
- Bom tom e boa ilustração, mas o estilo flat e o botão roxo fogem da marca.
- Título "Ops! Algo deu errado" + "Conexão Perdida" é redundante.
- Precisamos de variantes: sem internet · servidor fora · ave não encontrada · estado vazio de Favoritos.

## Telas implícitas que ainda não existem
Favoritos · Perfil · Login/cadastro · Identificar pássaro (câmera) · Busca/filtros · Mapa · Loading/skeleton · Estados vazios · Notificações · Dados e Armazenamento · Sobre/Créditos.
