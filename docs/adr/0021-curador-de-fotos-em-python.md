# ADR-0021: Curador de fotos em Python, uma exceção à ADR-0001

- **Status:** Aceita
- **Data:** 2026-10-17

## Contexto

A frente A da guinada escolhe a foto principal de cada espécie: uma ave sozinha, nunca bando, ninho, ovos, pena ou
ave morta. Isso pede um detector de objetos e um classificador de imagem sem treino (CLIP). Em Go não há
implementação madura e mantida desses modelos; em Python, o `transformers` (RT-DETR) e o `open_clip` são o padrão
da área, com código e pesos sob licenças permissivas.

A ADR-0001 define Go para o backend.

## Decisão

- O curador é um serviço separado, `passarim-photo-curator`, escrito em **Python**, com gRPC
  (`passarim.curator.v1.PhotoCuratorService`, no `passarim-proto` a partir da v0.3.0).
- **Só o worker do catalog o chama, durante a ingestão.** A API do catalog, o BFF e o app não dependem dele.
- Roda **só na CPU**, com os pesos dentro da imagem Docker e nenhuma chamada externa: rede `internal` no compose,
  `HF_HUB_OFFLINE=1`.
- Modelos: RT-DETR R50vd (Apache 2.0, código e pesos) e OpenCLIP ViT-B/32 LAION-2B (MIT, código e pesos).
  O Ultralytics fica de fora por ser AGPL.
- O resto do backend continua em Go. A exceção vale para trabalho de visão computacional que roda fora do caminho
  de uma requisição.

## Consequências

- Um segundo ecossistema no backend: `uv`, `ruff` e `pytest` ao lado do Go, com CI própria.
- A imagem do curador é grande (cerca de 2 GB), mas só o worker depende dela e só durante a ingestão.
- O contrato gRPC isola as linguagens: trocar o modelo, ou até a linguagem do curador, não mexe no catalog.
- O card dos pesos do LAION desaconselha uso implantado sem teste no domínio. O uso aqui é offline, com taxonomia
  fixa, medido num conjunto de referência e com revisão humana das 41 espécies; o README do curador registra isso.
