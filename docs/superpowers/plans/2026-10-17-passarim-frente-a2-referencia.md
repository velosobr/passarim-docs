# Frente A2 — Conjunto de referência, revisão e calibração: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Montar o conjunto de referência do curador (fotos reais do iNaturalist, revisadas pelo dono numa página), dividir em calibração e medição, calibrar os limites do `config.py` e pôr na CI o job que reprova abaixo das metas.

**Architecture:**
- Código novo num subpacote `photo_curator.reference`, só Python puro e testável sem rede nem modelos: manifesto, divisão, métricas, consulta ao iNaturalist, redução das fotos, revisão, características (saídas dos modelos) e busca dos limites.
- Scripts finos em `scripts/` ligam essas peças à rede, aos modelos e aos arquivos: `build_reference.py`, `make_review_page.py`, `apply_review.py`, `calibrate.py` e `measure.py`.
- A regra `curate` passa a receber os limites num objeto `Thresholds`. Assim a calibração testa milhares de combinações sem mexer no `config.py`, e o serviço continua usando os valores do `config.py`.
- A revisão é uma página (Artifact com banco compartilhado). O dono escolhe o rótulo de cada foto com um toque; o executor exporta o banco para `tests/reference/review.json`.

**Tech Stack:** Python 3.13, uv 0.13.1, Pillow 13.0.0, pytest 9.1.1 e ruff 0.17.1 (já no projeto, sem dependência nova; a rede usa `urllib` da biblioteca padrão). Página: HTML e JavaScript sem biblioteca, capacidade `db` do Artifact.

**Spec:** `passarim-docs/docs/superpowers/specs/2026-10-17-passarim-frente-a-curadoria-design.md` (seções 1 "Pronto quando" item 3, 2, 4.3, 4.5, 6 "Conjunto de referência" e "Referência", 7 PR 5)

## Global Constraints

- **Comentários didáticos em português** em todo código e configuração novos (regra do `~/dev/passarim/CLAUDE.md`): todo arquivo começa dizendo o seu papel; funções e blocos não triviais dizem o que fazem e por quê; conceitos (CSV, semente, estratificação, intervalo de Wilson, matriz de confusão, busca coordenada) são explicados na primeira vez que aparecem no arquivo.
- Identificadores em inglês; comentários, docstrings, mensagens, commits, PRs e README em português do Brasil.
- **Commits** com `-c user.name=velosobr -c user.email=linoc.veloso@gmail.com` e terminando com:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb
  ```
- **PRs** terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`, uma linha em branco e `https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb`.
- **Fotos de referência:** em `tests/reference/photos/<photo_id>.webp`, reduzidas a **512 px no lado maior**, com `tests/reference/manifest.csv` e `tests/reference/ATTRIBUTION.md`. Cada foto **mantém a licença CC dela**, fora da licença do repositório.
- **Licenças aceitas** (política do Passarim, as mesmas do catalog): `cc-by`, `cc-by-nc`, `cc-by-sa`, `cc-by-nc-sa`, `cc0`. Nunca ND, nunca sem licença.
- **iNaturalist:** `User-Agent` que identifica o projeto e no máximo ~1 requisição por segundo (termos de uso da API).
- **Metas** (spec seção 1), na metade de medição:
  - precisão de `SINGLE_BIRD` ≥ 95%;
  - revocação de `SINGLE_BIRD` ≥ 70%;
  - revocação dos descartes ≥ 90%. Os descartes são os rótulos `NEST`, `EGGS`, `FEATHER`, `DEAD_BIRD`, `NO_BIRD` e `OTHER`, contados juntos; conta como pega a predição que **não é** `SINGLE_BIRD` nem `FLOCK`.
  - A CI publica também o intervalo de Wilson de 95% de cada meta, a acurácia geral e a matriz de confusão.
- **Divisão:** semente fixa; estratificada pelo rótulo; agrupada por observação; a metade de medição tem pelo menos **50 `SINGLE_BIRD` e 40 descartes**. **A medição não ajusta limites:** ajustar depois de olhar a medição pede um sorteio novo, com a semente trocada e registrada.
- **Ponto de parada (spec seção 7, PR 5):** se a abordagem não alcançar as metas, o executor **para e volta ao dono com os números** antes de qualquer plano B.

## Review Focus

1. **Foto do manifesto sem arquivo, ou com arquivo corrompido:** a medição e a calibração têm que falhar dizendo qual foto, nunca pular em silêncio, porque pular muda a métrica sem ninguém ver. Coberto por `test_compute_all_fails_on_missing_image` (Task 6).
2. **iNaturalist devolve foto com licença fora da política** (ND, ou `null`) numa observação aceita: a foto não entra. Coberto por `test_photos_of_filters_licenses` (Task 4).
3. **Rodar o `build_reference.py` de novo** (para crescer o conjunto) ou a mesma foto vir de duas buscas: nada se duplica, e os rótulos já revisados ficam. Coberto por `test_add_photo_keeps_existing_row` (Task 4).
4. **Exportação da revisão com um id que não está no manifesto, ou com um rótulo desconhecido:** o `apply_review.py` recusa, em vez de gravar lixo. Coberto por `test_apply_rejects_unknown_photo` e `test_apply_rejects_unknown_label` (Task 5).
5. **Metade de medição menor que o mínimo:** o `measure.py` sai com erro e diz o que falta, em vez de publicar uma métrica sem valor. Coberto por `test_check_minimum_reports_shortfall` (Task 2) e pelo uso dele no `measure.py` (Task 6).

## Ajustes à spec registrados neste plano

- **Ruling: coluna `source` no manifesto.** Além das colunas da spec (`photo_id, observation_id, species, proposed_label, label, author, license, url`), o manifesto ganha `source`: de qual busca a foto veio (`species`, `dead`, `nest`...). Ela aparece na página de revisão e ajuda a explicar um erro do curador. **Custo se estiver errado:** uma coluna a mais no CSV.
- **Ruling: o `proposed_label` vem da busca, não do curador.** A foto buscada pela anotação "morto" chega sugerida como `DEAD_BIRD`; a foto de espécie, como `SINGLE_BIRD`. Se a sugestão viesse do próprio curador, o dono tenderia a confirmar o que o modelo disse, e a métrica ficaria otimista. **Custo:** o dono corrige mais sugestões, porque muita foto de "ninho" mostra o adulto fora do ninho.
- **Ruling: rótulo `EXCLUDED`.** O dono pode marcar uma foto como "ignorar" (ambígua, ou não dá para decidir). Ela sai da divisão e das métricas, mas fica no manifesto, para a escolha ficar registrada. **Custo:** uma opção a mais na página.

---

## Parte 1 — ferramentas (PR 5a, `feat/ferramentas-referencia`)

Tudo nesta parte é testado sem rede e sem modelos.

### Task 1: Limites num objeto `Thresholds`

**Files:**
- Modify: `src/photo_curator/config.py` (acrescentar ao fim, e imports no topo)
- Modify: `src/photo_curator/rules.py` (assinatura de `curate` e de `_has_dominant`, e os usos de `config.*`)
- Test: `tests/test_rules.py` (acrescentar dois testes)

**Interfaces:**
- Produces:
  - `config.Thresholds`, um `@dataclass(frozen=True)` com os campos `discard_min: Mapping[str, float]`, `flock_min: float`, `no_bird_min: float`, `no_bird_strong: float`, `weak_detection: float` e `dominance: float`;
  - `config.DEFAULT_THRESHOLDS: Thresholds`, montado das constantes do `config.py`;
  - `rules.curate(boxes, clip, sharpness, width, height, thresholds: Thresholds = config.DEFAULT_THRESHOLDS) -> Verdict`.

- [ ] **Step 1: Branch**

```bash
cd ~/dev/passarim/passarim-photo-curator && git switch main && git pull --ff-only && git switch -c feat/ferramentas-referencia
```

- [ ] **Step 2: Escrever os testes (falham)**

Acrescentar `import dataclasses` ao topo de `tests/test_rules.py` (antes de `import pytest`) e estes testes ao fim:

```python
def test_custom_thresholds_change_the_decision():
    # Com o limite padrão (0,6), "flock" 0,9 é bando; com 0,95, não é mais, e a
    # foto sem detecção cai em OTHER. É assim que a calibração experimenta limites.
    strict = dataclasses.replace(config.DEFAULT_THRESHOLDS, flock_min=0.95)
    assert curate([], clip(flock=0.9), 0.4, W, H).category is Category.FLOCK
    assert curate([], clip(flock=0.9), 0.4, W, H, strict).category is Category.OTHER


def test_default_thresholds_mirror_the_constants():
    t = config.DEFAULT_THRESHOLDS
    assert dict(t.discard_min) == config.DISCARD_MIN
    assert (t.flock_min, t.no_bird_min, t.no_bird_strong) == (config.FLOCK_MIN, config.NO_BIRD_MIN, config.NO_BIRD_STRONG)
    assert (t.weak_detection, t.dominance) == (config.WEAK_DETECTION, config.DOMINANCE)
```

Run: `uv run pytest tests/test_rules.py -q`
Expected: FAIL com `AttributeError: module 'photo_curator.config' has no attribute 'DEFAULT_THRESHOLDS'`.

- [ ] **Step 3: `Thresholds` no `config.py`**

No topo de `src/photo_curator/config.py`, logo depois da docstring:

```python
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
```

Ao fim do arquivo:

```python


@dataclass(frozen=True)
class Thresholds:
    """Os limites da regra (rules.curate) num objeto só.

    O serviço usa sempre DEFAULT_THRESHOLDS, montado das constantes acima. A
    calibração (photo_curator.reference.calibrate) cria cópias com um limite
    trocado, com dataclasses.replace, e mede cada uma: assim ela experimenta
    milhares de combinações sem mexer neste arquivo.
    """

    discard_min: Mapping[str, float]
    flock_min: float
    no_bird_min: float
    no_bird_strong: float
    weak_detection: float
    dominance: float


# MappingProxyType é uma "vista só de leitura" de um dicionário: ninguém muda
# os limites padrão por engano no meio da execução.
DEFAULT_THRESHOLDS = Thresholds(
    discard_min=MappingProxyType(dict(DISCARD_MIN)),
    flock_min=FLOCK_MIN,
    no_bird_min=NO_BIRD_MIN,
    no_bird_strong=NO_BIRD_STRONG,
    weak_detection=WEAK_DETECTION,
    dominance=DOMINANCE,
)
```

- [ ] **Step 4: `rules.py` lê os limites do parâmetro**

Em `src/photo_curator/rules.py`:

1. Import: trocar `from photo_curator import config` por `from photo_curator import config` e `from photo_curator.config import Thresholds` (duas linhas).
2. `_has_dominant` passa a receber o limite:

```python
def _has_dominant(boxes: Sequence[Box], dominance: float) -> bool:
    """Com duas aves ou mais, a maior é "dominante" se tem pelo menos
    `dominance` vezes a área da segunda maior."""
    areas = sorted((b.area for b in boxes), reverse=True)
    return areas[0] >= dominance * areas[1]
```

3. Assinatura de `curate`, com o parâmetro novo depois de `height: int,`:

```python
    thresholds: Thresholds = config.DEFAULT_THRESHOLDS,
```

e, na docstring, depois da linha de `width, height`:

```
    thresholds: os limites da regra; o padrão vem do config.py. Só a
    calibração passa outros.
```

4. Dentro de `curate`, trocar cada leitura do `config`:
   - `config.DISCARD_MIN[name]` → `thresholds.discard_min[name]`
   - `config.FLOCK_MIN` → `thresholds.flock_min`
   - `config.NO_BIRD_MIN` → `thresholds.no_bird_min`
   - `config.NO_BIRD_STRONG` → `thresholds.no_bird_strong`
   - `config.WEAK_DETECTION` → `thresholds.weak_detection`
   - `_has_dominant(clamped)` → `_has_dominant(clamped, thresholds.dominance)`

   `config.EDGE_TOLERANCE` fica como está: a borda não é calibrada.

- [ ] **Step 5: Rodar e ver passar**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: todos passam (43 antigos + 2 novos); `grep -n "config\.\(DISCARD_MIN\|FLOCK_MIN\|NO_BIRD\|WEAK\|DOMINANCE\)" src/photo_curator/rules.py` não mostra nada.

- [ ] **Step 6: Commit**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "refactor: limites da regra num objeto Thresholds" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
```

### Task 2: Manifesto e divisão em calibração e medição

**Files:**
- Create: `src/photo_curator/reference/__init__.py`, `src/photo_curator/reference/manifest.py`, `src/photo_curator/reference/split.py`
- Test: `tests/test_reference_manifest.py`, `tests/test_reference_split.py`

**Interfaces:**
- Produces (`photo_curator.reference.manifest`):
  - `LABELS: tuple[str, ...]` (as 8 categorias do contrato, sem `UNSPECIFIED`), `EXCLUDED = "EXCLUDED"`, `DISCARD_LABELS: frozenset[str]`;
  - `@dataclass(frozen=True) class Row` com os campos `photo_id, observation_id, species, proposed_label, label, author, license, url, source` (todos `str`);
  - `COLUMNS: tuple[str, ...]`;
  - `read(path: Path) -> list[Row]`, `write(path: Path, rows: Iterable[Row]) -> None`;
  - `image_path(folder: Path, row: Row) -> Path`;
  - `attribution_markdown(rows: Iterable[Row]) -> str`.
- Produces (`photo_curator.reference.split`):
  - `SEED = 20261017`, `CALIBRATION = "calibration"`, `MEASUREMENT = "measurement"`, `MIN_SINGLE = 50`, `MIN_DISCARD = 40`;
  - `split(rows: Sequence[Row], seed: int = SEED) -> dict[str, list[Row]]`;
  - `check_minimum(measurement: Sequence[Row]) -> list[str]`.

- [ ] **Step 1: Escrever os testes (falham)**

`tests/test_reference_manifest.py`:

```python
"""Testes do manifesto do conjunto de referência (CSV com uma linha por foto)."""

import pytest

from photo_curator.reference import manifest
from photo_curator.reference.manifest import Row


def row(photo_id: str, label: str = "SINGLE_BIRD") -> Row:
    return Row(photo_id, "9" + photo_id, "Crotophaga ani", "SINGLE_BIRD", label, "Fulana", "cc-by", "https://x/1", "species")


def test_write_then_read_roundtrip_sorted_by_photo_id(tmp_path):
    path = tmp_path / "manifest.csv"
    manifest.write(path, [row("20"), row("3")])
    assert [r.photo_id for r in manifest.read(path)] == ["3", "20"]  # ordem numérica, não de texto
    assert manifest.read(path)[0] == row("3")


def test_read_rejects_wrong_columns(tmp_path):
    path = tmp_path / "manifest.csv"
    path.write_text("photo_id,label\n1,SINGLE_BIRD\n", encoding="utf-8")
    with pytest.raises(ValueError, match="colunas"):
        manifest.read(path)


def test_attribution_lists_every_photo():
    text = manifest.attribution_markdown([row("1"), row("2")])
    assert "mantêm a licença" in text
    assert text.count("| Fulana |") == 2
    assert "https://x/1" in text


def test_image_path(tmp_path):
    assert manifest.image_path(tmp_path, row("7")) == tmp_path / "photos" / "7.webp"
```

`tests/test_reference_split.py`:

```python
"""Testes da divisão do conjunto de referência em calibração e medição."""

from photo_curator.reference import split as sp
from photo_curator.reference.manifest import EXCLUDED, Row


def row(photo_id: int, observation_id: int, label: str) -> Row:
    return Row(str(photo_id), str(observation_id), "sp", label, label, "a", "cc-by", "u", "species")


def dataset() -> list[Row]:
    # 30 observações de ave sozinha (2 fotos cada), 20 de ninho (1 foto) e 5 de bando.
    rows, pid = [], 0
    for obs in range(30):
        for _ in range(2):
            pid += 1
            rows.append(row(pid, 1000 + obs, "SINGLE_BIRD"))
    for obs in range(20):
        pid += 1
        rows.append(row(pid, 2000 + obs, "NEST"))
    for obs in range(5):
        pid += 1
        rows.append(row(pid, 3000 + obs, "FLOCK"))
    return rows


def test_split_is_deterministic():
    assert sp.split(dataset()) == sp.split(dataset())


def test_same_observation_never_in_both_halves():
    halves = sp.split(dataset())
    cal = {r.observation_id for r in halves[sp.CALIBRATION]}
    mea = {r.observation_id for r in halves[sp.MEASUREMENT]}
    assert not cal & mea
    assert len(halves[sp.CALIBRATION]) + len(halves[sp.MEASUREMENT]) == len(dataset())


def test_split_is_stratified_by_label():
    halves = sp.split(dataset())
    for label in ("SINGLE_BIRD", "NEST", "FLOCK"):
        groups = {
            half: {r.observation_id for r in rows if r.label == label} for half, rows in halves.items()
        }
        # A metade de medição fica com metade dos grupos (ou um a mais, se ímpar).
        assert len(groups[sp.MEASUREMENT]) - len(groups[sp.CALIBRATION]) in (0, 1)


def test_other_seed_gives_other_split():
    a = sp.split(dataset(), seed=1)[sp.MEASUREMENT]
    b = sp.split(dataset(), seed=2)[sp.MEASUREMENT]
    assert a != b


def test_excluded_and_unlabeled_rows_are_left_out():
    rows = [row(1, 1, "SINGLE_BIRD"), row(2, 2, EXCLUDED), row(3, 3, "")]
    halves = sp.split(rows)
    assert [r.photo_id for h in halves.values() for r in h] == ["1"]


def test_check_minimum_accepts_enough_photos():
    rows = [row(i, i, "SINGLE_BIRD") for i in range(50)] + [row(100 + i, 100 + i, "EGGS") for i in range(40)]
    assert sp.check_minimum(rows) == []


def test_check_minimum_reports_shortfall():
    rows = [row(i, i, "SINGLE_BIRD") for i in range(49)] + [row(100 + i, 100 + i, "FLOCK") for i in range(40)]
    problems = sp.check_minimum(rows)
    assert len(problems) == 2  # 49 aves sozinhas e 0 descartes (bando não é descarte)
    assert "49" in problems[0]
```

Run: `uv run pytest tests/test_reference_manifest.py tests/test_reference_split.py -q`
Expected: FAIL com `ModuleNotFoundError: No module named 'photo_curator.reference'`.

- [ ] **Step 2: Escrever `reference/__init__.py` e `manifest.py`**

`src/photo_curator/reference/__init__.py`:

```python
"""Conjunto de referência do curador: as fotos rotuladas à mão que medem se a
regra acerta. Nada aqui roda no serviço: só os scripts de scripts/ e a CI usam.
"""
```

`src/photo_curator/reference/manifest.py`:

```python
"""O manifesto do conjunto de referência: tests/reference/manifest.csv.

CSV ("valores separados por vírgula") é uma tabela em texto: a primeira linha
tem os nomes das colunas e cada linha seguinte é uma foto. Escolhemos CSV porque
dá para ler e revisar no GitHub, e o diff de um PR mostra exatamente quais
rótulos mudaram.

Colunas:
- photo_id, observation_id: ids no iNaturalist (a observação agrupa as fotos
  de um mesmo encontro com a ave);
- species: nome científico que a observação traz;
- proposed_label: a sugestão de rótulo que veio da busca (ver sources.py);
- label: o rótulo revisado pelo dono, que vale para as métricas (vazio até a revisão);
- author, license, url: atribuição exigida pela licença CC;
- source: de qual busca a foto veio (species, dead, nest...).

Quem usa: os scripts de scripts/ e os outros módulos de photo_curator.reference.
"""

import csv
from collections.abc import Iterable
from dataclasses import dataclass, fields
from pathlib import Path

# Os rótulos possíveis são as categorias do contrato, menos UNSPECIFIED (que é
# "a imagem não abriu", nunca um rótulo de verdade).
LABELS: tuple[str, ...] = (
    "SINGLE_BIRD",
    "FLOCK",
    "NEST",
    "EGGS",
    "FEATHER",
    "DEAD_BIRD",
    "NO_BIRD",
    "OTHER",
)
# EXCLUDED: o dono marcou "ignorar" (foto ambígua). Fica no manifesto, mas sai
# da divisão e das métricas.
EXCLUDED = "EXCLUDED"
# Os rótulos de descarte, contados juntos na meta de "revocação dos descartes".
DISCARD_LABELS = frozenset({"NEST", "EGGS", "FEATHER", "DEAD_BIRD", "NO_BIRD", "OTHER"})


@dataclass(frozen=True)
class Row:
    """Uma foto do conjunto de referência (uma linha do CSV)."""

    photo_id: str
    observation_id: str
    species: str
    proposed_label: str
    label: str
    author: str
    license: str
    url: str
    source: str


# A ordem das colunas no arquivo é a ordem dos campos da Row.
COLUMNS: tuple[str, ...] = tuple(f.name for f in fields(Row))


def read(path: Path) -> list[Row]:
    """Lê o manifesto. Recusa um arquivo com colunas diferentes das esperadas,
    em vez de ler colunas trocadas sem perceber."""
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if tuple(reader.fieldnames or ()) != COLUMNS:
            raise ValueError(f"colunas de {path}: {reader.fieldnames}; esperado {list(COLUMNS)}")
        return [Row(**line) for line in reader]


def write(path: Path, rows: Iterable[Row]) -> None:
    """Grava o manifesto em ordem numérica de photo_id: a mesma entrada dá
    sempre o mesmo arquivo, e o diff do PR mostra só o que mudou."""
    ordered = sorted(rows, key=lambda r: int(r.photo_id))
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(COLUMNS)
        for r in ordered:
            writer.writerow([getattr(r, c) for c in COLUMNS])


def image_path(folder: Path, row: Row) -> Path:
    """Onde fica a foto de uma linha: <pasta>/photos/<photo_id>.webp."""
    return folder / "photos" / f"{row.photo_id}.webp"


def attribution_markdown(rows: Iterable[Row]) -> str:
    """O texto do ATTRIBUTION.md: a licença CC exige citar autor, licença e
    origem de cada foto."""
    lines = [
        "# Fotos do conjunto de referência",
        "",
        "As fotos de `photos/` vêm do iNaturalist e **mantêm a licença de cada uma** (fora da licença do",
        "repositório). Foram reduzidas a 512 px no lado maior e convertidas para WebP.",
        "",
        "| Arquivo | Autor | Licença | Observação |",
        "|---|---|---|---|",
    ]
    for r in sorted(rows, key=lambda r: int(r.photo_id)):
        lines.append(f"| `photos/{r.photo_id}.webp` | {r.author} | {r.license} | {r.url} |")
    return "\n".join(lines) + "\n"
```

- [ ] **Step 3: Escrever `split.py`**

```python
"""Divide o conjunto de referência em duas metades: calibração e medição.

Por que duas metades: se escolhêssemos os limites do config.py olhando as
mesmas fotos em que medimos o resultado, a medição ficaria otimista (os limites
"decorariam" aquelas fotos). Então os limites saem da metade de calibração, e a
CI mede na outra, que a calibração nunca vê.

Como dividimos:
- AGRUPADA por observação: as fotos de uma mesma observação (a mesma ave, no
  mesmo dia) ficam sempre na mesma metade. Senão a calibração veria uma foto
  quase igual a outra da medição, e a medição vazaria.
- ESTRATIFICADA pelo rótulo: dentro de cada rótulo, metade dos grupos vai para
  cada lado. Assim as duas metades têm proporções parecidas de ninho, ovo,
  bando etc., em vez de o sorteio jogar todos os ovos de um lado só.
- SEMENTE fixa: o embaralhamento usa um gerador de números "aleatórios" que,
  com a mesma semente, produz sempre a mesma sequência. A divisão sai igual em
  qualquer máquina e em qualquer dia.

A MEDIÇÃO NÃO AJUSTA LIMITES. Se alguém mudar um limite depois de olhar o
resultado da medição, precisa trocar SEED (e registrar o motivo no commit): o
sorteio novo cria uma medição que a pessoa ainda não viu.

Quem usa: scripts/calibrate.py e scripts/measure.py.
"""

import random
from collections import Counter, defaultdict
from collections.abc import Sequence

from photo_curator.reference.manifest import DISCARD_LABELS, EXCLUDED, Row

SEED = 20261017
CALIBRATION = "calibration"
MEASUREMENT = "measurement"

# Tamanho mínimo da metade de medição (spec 4.5): com menos fotos, uma foto a
# mais ou a menos mexe demais na porcentagem.
MIN_SINGLE = 50
MIN_DISCARD = 40


def _group_label(members: Sequence[Row]) -> str:
    """O rótulo de um grupo (observação) é o mais comum entre as fotos dele; no
    empate, o primeiro em ordem alfabética, para o resultado ser sempre o mesmo."""
    counts = Counter(r.label for r in members)
    return min(counts, key=lambda label: (-counts[label], label))


def split(rows: Sequence[Row], seed: int = SEED) -> dict[str, list[Row]]:
    """Divide as fotos rotuladas (sem as EXCLUDED e as ainda sem rótulo)."""
    usable = [r for r in rows if r.label and r.label != EXCLUDED]
    groups: dict[str, list[Row]] = defaultdict(list)
    for r in usable:
        groups[r.observation_id].append(r)
    strata: dict[str, list[str]] = defaultdict(list)
    for observation_id, members in groups.items():
        strata[_group_label(members)].append(observation_id)

    halves: dict[str, list[Row]] = {CALIBRATION: [], MEASUREMENT: []}
    for label in sorted(strata):
        # Ordenar antes de embaralhar: o resultado não pode depender da ordem
        # das linhas no CSV. A semente leva o rótulo junto para cada estrato ter
        # o seu próprio sorteio.
        observation_ids = sorted(strata[label], key=int)
        random.Random(f"{seed}:{label}").shuffle(observation_ids)
        for i, observation_id in enumerate(observation_ids):
            # Alterna: 1º grupo para a medição, 2º para a calibração... Com um
            # número ímpar de grupos, a medição fica com um a mais.
            half = MEASUREMENT if i % 2 == 0 else CALIBRATION
            halves[half].extend(groups[observation_id])
    for members in halves.values():
        members.sort(key=lambda r: int(r.photo_id))
    return halves


def check_minimum(measurement: Sequence[Row]) -> list[str]:
    """Os problemas de tamanho da metade de medição (lista vazia = tudo certo)."""
    single = sum(r.label == "SINGLE_BIRD" for r in measurement)
    discard = sum(r.label in DISCARD_LABELS for r in measurement)
    problems = []
    if single < MIN_SINGLE:
        problems.append(f"a medição tem {single} fotos SINGLE_BIRD; o mínimo é {MIN_SINGLE}")
    if discard < MIN_DISCARD:
        problems.append(f"a medição tem {discard} fotos de descarte; o mínimo é {MIN_DISCARD}")
    return problems
```

- [ ] **Step 4: Rodar e ver passar**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: manifesto e divisão do conjunto de referência" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
```

### Task 3: Métricas, intervalo de Wilson e matriz de confusão

**Files:**
- Create: `src/photo_curator/reference/metrics.py`
- Test: `tests/test_reference_metrics.py`

**Interfaces:**
- Consumes: `LABELS`, `DISCARD_LABELS` (Task 2).
- Produces:
  - `wilson(hits: int, total: int, z: float = 1.96) -> tuple[float, float]`;
  - `@dataclass(frozen=True) class Rate` com `hits: int`, `total: int`, a propriedade `value` e o método `interval()`;
  - `TARGETS: dict[str, float] = {"single_precision": 0.95, "single_recall": 0.70, "discard_recall": 0.90}`;
  - `@dataclass(frozen=True) class Report` com `single_precision`, `single_recall`, `discard_recall` e `accuracy` (todos `Rate`), mais `confusion: dict[tuple[str, str], int]`; os métodos `failures() -> list[str]`, `deficit() -> float` e `markdown() -> str`;
  - `evaluate(pairs: Iterable[tuple[str, str]]) -> Report`. Cada par é `(rótulo, predição)`, e a predição é o nome da categoria (`"SINGLE_BIRD"`, `"UNSPECIFIED"`...).

- [ ] **Step 1: Escrever os testes (falham)**

`tests/test_reference_metrics.py`:

```python
"""Testes das métricas. Os números esperados foram contados à mão no conjunto
abaixo, e os do intervalo de Wilson, conferidos com a fórmula."""

import pytest

from photo_curator.reference.metrics import evaluate, wilson

# 10 aves sozinhas: 8 acertos, 1 vista como bando, 1 como ninho.
# 2 bandos: 1 visto como ave sozinha, 1 acerto.
# 5 descartes: ninho certo, ninho visto como ave sozinha, ninho que não abriu,
# ovos certos, ovos vistos como bando.
PAIRS = (
    [("SINGLE_BIRD", "SINGLE_BIRD")] * 8
    + [("SINGLE_BIRD", "FLOCK"), ("SINGLE_BIRD", "NEST")]
    + [("FLOCK", "SINGLE_BIRD"), ("FLOCK", "FLOCK")]
    + [("NEST", "NEST"), ("NEST", "SINGLE_BIRD"), ("NEST", "UNSPECIFIED"), ("EGGS", "EGGS"), ("EGGS", "FLOCK")]
)


def test_rates_counted_by_hand():
    r = evaluate(PAIRS)
    # Previstas como ave sozinha: 8 certas + 1 bando + 1 ninho = 10.
    assert (r.single_precision.hits, r.single_precision.total) == (8, 10)
    assert (r.single_recall.hits, r.single_recall.total) == (8, 10)
    # Descartes pegos: ninho→ninho, ninho→não abriu, ovos→ovos. Ovos→bando NÃO conta.
    assert (r.discard_recall.hits, r.discard_recall.total) == (3, 5)
    assert (r.accuracy.hits, r.accuracy.total) == (11, 17)
    assert r.confusion[("SINGLE_BIRD", "SINGLE_BIRD")] == 8
    assert r.confusion[("EGGS", "FLOCK")] == 1


def test_failures_and_deficit():
    r = evaluate(PAIRS)
    # Falham a precisão (80%) e os descartes (60%); a revocação (80%) passa dos 70%.
    assert len(r.failures()) == 2
    # (0,95 - 0,8) + (0,70 - 0,80 -> 0) + (0,90 - 0,6) = 0,45
    assert r.deficit() == pytest.approx(0.45)
    perfect = evaluate([("SINGLE_BIRD", "SINGLE_BIRD"), ("NEST", "NEST")])
    assert perfect.failures() == []
    assert perfect.deficit() == 0.0


def test_wilson_known_values():
    assert wilson(19, 20) == pytest.approx((0.7639, 0.9911), abs=1e-4)
    assert wilson(10, 10) == pytest.approx((0.7225, 1.0), abs=1e-4)
    assert wilson(0, 0) == (0.0, 1.0)  # sem dados: não sabemos nada


def test_empty_rate_fails_its_target():
    # Nenhuma foto de descarte: a meta não pode passar "por vazio".
    r = evaluate([("SINGLE_BIRD", "SINGLE_BIRD")])
    assert any("descartes" in f for f in r.failures())


def test_markdown_has_targets_and_confusion():
    text = evaluate(PAIRS).markdown()
    assert "Precisão de SINGLE_BIRD" in text
    assert "80.0%" in text
    assert "| SINGLE_BIRD |" in text  # linha da matriz de confusão
```

Run: `uv run pytest tests/test_reference_metrics.py -q`
Expected: FAIL com `ModuleNotFoundError: No module named 'photo_curator.reference.metrics'`.

- [ ] **Step 2: Escrever `metrics.py`**

```python
"""As métricas do conjunto de referência (spec, seção 1).

- Precisão de SINGLE_BIRD: das fotos que o curador chamou de ave sozinha,
  quantas são mesmo. É a meta mais importante: erro aqui põe ninho ou bando
  como foto principal.
- Revocação de SINGLE_BIRD: das fotos que são ave sozinha, quantas o curador
  reconheceu. Sem ela, um curador que descarta tudo passaria nas outras metas.
- Revocação dos descartes: das fotos de ninho, ovos, pena, ave morta, sem ave
  ou "outro", quantas o curador tirou da escolha. Conta como pega qualquer
  predição que não seja SINGLE_BIRD nem FLOCK (UNSPECIFIED também tira a foto).

INTERVALO DE WILSON: com ~90 fotos, a porcentagem medida é uma estimativa. O
intervalo de 95% diz a faixa onde o valor "de verdade" provavelmente está. A
fórmula de Wilson funciona bem com poucas amostras e perto de 0% ou 100%, onde
a fórmula simples (p ± 1,96·√(p(1-p)/n)) passaria de 100%.

MATRIZ DE CONFUSÃO: uma tabela com o rótulo nas linhas e a predição nas
colunas. A diagonal são os acertos; o resto mostra QUE erro o curador comete
(ex.: ovos vistos como ave sozinha).

Quem usa: reference/calibrate.py e scripts/measure.py.
"""

import math
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass

from photo_curator.reference.manifest import DISCARD_LABELS, LABELS

# Metas da spec. Os nomes são os campos do Report.
TARGETS: dict[str, float] = {
    "single_precision": 0.95,
    "single_recall": 0.70,
    "discard_recall": 0.90,
}

_TITLES = {
    "single_precision": "Precisão de SINGLE_BIRD",
    "single_recall": "Revocação de SINGLE_BIRD",
    "discard_recall": "Revocação dos descartes",
}

# Predições que tiram a foto da escolha da foto principal e da galeria.
_KEPT = frozenset({"SINGLE_BIRD", "FLOCK"})


def wilson(hits: int, total: int, z: float = 1.96) -> tuple[float, float]:
    """Intervalo de Wilson (z = 1,96 dá 95%). Sem amostras: (0, 1)."""
    if total == 0:
        return (0.0, 1.0)
    p = hits / total
    denominator = 1 + z * z / total
    center = p + z * z / (2 * total)
    margin = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))
    return (max(0.0, (center - margin) / denominator), min(1.0, (center + margin) / denominator))


@dataclass(frozen=True)
class Rate:
    """Uma proporção "acertos de total", com o valor e o intervalo."""

    hits: int
    total: int

    @property
    def value(self) -> float:
        return self.hits / self.total if self.total else 0.0

    def interval(self) -> tuple[float, float]:
        return wilson(self.hits, self.total)


@dataclass(frozen=True)
class Report:
    single_precision: Rate
    single_recall: Rate
    discard_recall: Rate
    accuracy: Rate
    # (rótulo, predição) -> quantas fotos.
    confusion: dict[tuple[str, str], int]

    def failures(self) -> list[str]:
        """As metas não atingidas, em texto. Uma meta sem nenhuma foto conta como
        não atingida: passar "por vazio" esconderia um conjunto mal montado."""
        out = []
        for name, target in TARGETS.items():
            rate: Rate = getattr(self, name)
            if rate.total == 0 or rate.value < target:
                out.append(f"{_TITLES[name].lower()}: {rate.value:.1%} ({rate.hits}/{rate.total}), meta {target:.0%}")
        return out

    def deficit(self) -> float:
        """Quanto falta, somado, para atingir as metas (0 = todas atingidas). A
        calibração usa isso para preferir os limites que chegam mais perto."""
        return sum(max(0.0, target - getattr(self, name).value) for name, target in TARGETS.items())

    def markdown(self) -> str:
        """O resumo que a CI publica: metas com intervalo, acurácia e matriz."""
        lines = ["| Meta | Valor | IC 95% (Wilson) | Mínimo | |", "|---|---|---|---|---|"]
        for name, target in TARGETS.items():
            rate: Rate = getattr(self, name)
            lo, hi = rate.interval()
            ok = "ok" if rate.total and rate.value >= target else "abaixo"
            lines.append(
                f"| {_TITLES[name]} | {rate.value:.1%} ({rate.hits}/{rate.total}) | {lo:.1%} a {hi:.1%} "
                f"| {target:.0%} | {ok} |"
            )
        lines += ["", f"Acurácia geral: {self.accuracy.value:.1%} ({self.accuracy.hits}/{self.accuracy.total})", ""]
        columns = [*LABELS, "UNSPECIFIED"]
        lines.append("| rótulo \\ predição | " + " | ".join(columns) + " |")
        lines.append("|---" * (len(columns) + 1) + "|")
        for label in LABELS:
            counts = [str(self.confusion.get((label, c), 0)) for c in columns]
            lines.append(f"| {label} | " + " | ".join(counts) + " |")
        return "\n".join(lines) + "\n"


def evaluate(pairs: Iterable[tuple[str, str]]) -> Report:
    """Calcula o relatório a partir de pares (rótulo, predição)."""
    pairs = list(pairs)
    predicted_single = [label for label, pred in pairs if pred == "SINGLE_BIRD"]
    labeled_single = [pred for label, pred in pairs if label == "SINGLE_BIRD"]
    discards = [pred for label, pred in pairs if label in DISCARD_LABELS]
    return Report(
        single_precision=Rate(sum(label == "SINGLE_BIRD" for label in predicted_single), len(predicted_single)),
        single_recall=Rate(sum(pred == "SINGLE_BIRD" for pred in labeled_single), len(labeled_single)),
        discard_recall=Rate(sum(pred not in _KEPT for pred in discards), len(discards)),
        accuracy=Rate(sum(label == pred for label, pred in pairs), len(pairs)),
        confusion=dict(Counter(pairs)),
    )
```

- [ ] **Step 3: Rodar e ver passar**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: todos passam.

- [ ] **Step 4: Commit**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: métricas do conjunto de referência com intervalo de Wilson" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
```

### Task 4: Busca no iNaturalist, redução das fotos e `build_reference.py`

**Files:**
- Create: `src/photo_curator/reference/inat.py`, `src/photo_curator/reference/images.py`, `src/photo_curator/reference/sources.py`
- Create: `scripts/build_reference.py`, `scripts/species.txt`
- Modify: `.gitignore` (acrescentar `build/` e `.cache/`)
- Test: `tests/test_reference_inat.py`, `tests/test_reference_images.py`

**Interfaces:**
- Consumes: `Row`, `manifest.read/write/attribution_markdown/image_path` (Task 2).
- Produces (`inat`):
  - `LICENSES: tuple[str, ...]`;
  - `@dataclass(frozen=True) class RemotePhoto` com os campos `photo_id, observation_id, species, author, license, url, image_url`;
  - `author_of(attribution: str) -> str`;
  - `observation_params(extra: Mapping[str, str], per_page: int) -> dict[str, str]`;
  - `photos_of(observation: Mapping, max_photos: int) -> list[RemotePhoto]`;
  - `add_photo(rows: dict[str, Row], photo: RemotePhoto, proposed_label: str, source: str) -> bool`;
  - `class Client` com `get_json(path, params) -> dict`, `get_bytes(url) -> bytes` e `taxon_id(name) -> str | None`.
- Produces (`images`): `MAX_SIDE = 512` e `shrink(data: bytes) -> bytes`, que devolve um WebP.
- Produces (`sources`): `@dataclass(frozen=True) class Source` com `name`, `params`, `proposed_label`, `observations` e `photos_per_observation`; `HARD_SOURCES: tuple[Source, ...]`; `species_source(taxon_id: str, observations: int) -> Source`.

Anotações do iNaturalist usadas (conferidas na API em 2026-10-17, total de observações de aves no Brasil com foto CC):

| Busca | Parâmetros | Sugestão | Total |
|---|---|---|---|
| ave morta | `term_id=17&term_value_id=19` | `DEAD_BIRD` | 1654 |
| ovo (estágio de vida) | `term_id=1&term_value_id=7` | `EGGS` | 414 |
| ovo (evidência) | `term_id=22&term_value_id=30` | `EGGS` | 317 |
| pena | `term_id=22&term_value_id=23` | `FEATHER` | 1375 |
| ninho ("construção") | `term_id=22&term_value_id=35` | `NEST` | 1322 |
| osso | `term_id=22&term_value_id=27` | `DEAD_BIRD` | 81 |
| anilhamento | `q=anilhamento` / `q=banding` com `search_on=description` | `OTHER` | 7 / 36 |
| bando | `q=bando&search_on=description` | `FLOCK` | 606 |

- [ ] **Step 1: Escrever os testes (falham)**

`tests/test_reference_inat.py`:

```python
"""Testes das partes puras da busca no iNaturalist (sem rede)."""

from photo_curator.reference import inat
from photo_curator.reference.manifest import Row

OBSERVATION = {
    "id": 408681516,
    "uri": "https://www.inaturalist.org/observations/408681516",
    "taxon": {"name": "Vanellus chilensis"},
    "photos": [
        {"id": 1, "license_code": "cc-by-nc", "attribution": "(c) desuni, some rights reserved (CC BY-NC)",
         "url": "https://static.inaturalist.org/photos/1/square.jpg"},
        {"id": 2, "license_code": "cc-by-nd", "attribution": "(c) x, some rights reserved (CC BY-ND)",
         "url": "https://static.inaturalist.org/photos/2/square.jpg"},
        {"id": 3, "license_code": None, "attribution": "(c) y, all rights reserved",
         "url": "https://static.inaturalist.org/photos/3/square.jpg"},
        {"id": 4, "license_code": "cc0", "attribution": "(c) Zé, no rights reserved (CC0)",
         "url": "https://static.inaturalist.org/photos/4/square.jpg"},
    ],
}


def test_author_of():
    assert inat.author_of("(c) desuni, some rights reserved (CC BY-NC)") == "desuni"
    assert inat.author_of("(c) Zé, no rights reserved (CC0)") == "Zé"
    assert inat.author_of("") == "desconhecido"


def test_photos_of_filters_licenses():
    photos = inat.photos_of(OBSERVATION, max_photos=5)
    assert [p.photo_id for p in photos] == ["1", "4"]  # ND e sem licença ficam de fora
    first = photos[0]
    assert first.observation_id == "408681516"
    assert first.species == "Vanellus chilensis"
    assert first.author == "desuni"
    assert first.image_url == "https://static.inaturalist.org/photos/1/large.jpg"
    assert first.url == OBSERVATION["uri"]


def test_photos_of_respects_max():
    assert len(inat.photos_of(OBSERVATION, max_photos=1)) == 1


def test_observation_params_fix_place_and_licenses():
    params = inat.observation_params({"term_id": "17"}, per_page=12)
    assert params["place_id"] == "6878"
    assert params["photo_license"] == "cc-by,cc-by-nc,cc-by-sa,cc-by-nc-sa,cc0"
    assert params["per_page"] == "12"
    assert params["term_id"] == "17"


def test_add_photo_keeps_existing_row():
    photo = inat.photos_of(OBSERVATION, max_photos=1)[0]
    reviewed = Row("1", "408681516", "Vanellus chilensis", "NEST", "SINGLE_BIRD", "desuni", "cc-by-nc", "u", "nest")
    rows = {"1": reviewed}
    # A mesma foto vinda de outra busca não sobrescreve o rótulo já revisado.
    assert inat.add_photo(rows, photo, "DEAD_BIRD", "dead") is False
    assert rows["1"] is reviewed
    rows.clear()
    assert inat.add_photo(rows, photo, "NEST", "nest") is True
    assert rows["1"].proposed_label == "NEST"
    assert rows["1"].label == ""
    assert rows["1"].source == "nest"


def test_client_waits_between_requests():
    # O relógio e o sleep são falsos: o teste não espera de verdade.
    now = [100.0]
    slept = []
    client = inat.Client(sleep=lambda s: slept.append(s), clock=lambda: now[0])
    client._wait()
    client._wait()  # chamada imediata: precisa esperar o intervalo inteiro
    assert slept == [inat.MIN_INTERVAL]
```

`tests/test_reference_images.py`:

```python
"""Testes da redução das fotos para o conjunto de referência."""

import io

from PIL import Image

from photo_curator.reference.images import MAX_SIDE, shrink


def jpeg(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (10, 120, 30)).save(buf, format="JPEG")
    return buf.getvalue()


def test_landscape_is_reduced_to_512_wide():
    out = Image.open(io.BytesIO(shrink(jpeg(1024, 600))))
    assert out.format == "WEBP"
    assert out.size == (MAX_SIDE, 300)


def test_portrait_is_reduced_to_512_tall():
    assert Image.open(io.BytesIO(shrink(jpeg(600, 1024)))).size == (300, MAX_SIDE)


def test_small_image_is_not_enlarged():
    assert Image.open(io.BytesIO(shrink(jpeg(200, 100)))).size == (200, 100)
```

Run: `uv run pytest tests/test_reference_inat.py tests/test_reference_images.py -q`
Expected: FAIL com `ModuleNotFoundError` (`inat` e `images` não existem).

- [ ] **Step 2: Escrever `inat.py`**

```python
"""Busca de fotos no iNaturalist para montar o conjunto de referência.

O iNaturalist é uma rede de observações de natureza: cada OBSERVAÇÃO é um
encontro com um ser vivo (data, lugar, espécie) e tem uma ou mais FOTOS. A API
é aberta, mas os termos pedem um User-Agent que identifique o projeto e no
máximo ~1 requisição por segundo: o Client cuida das duas coisas.

As ANOTAÇÕES são marcações padronizadas que a comunidade põe nas observações
(ex.: "vivo ou morto: morto", "evidência: ninho"). Usamos elas para achar de
propósito os casos difíceis (ver sources.py).

Usamos só a biblioteca padrão (urllib) para não acrescentar dependência: são
poucas centenas de requisições, uma vez.

Quem usa: scripts/build_reference.py.
"""

import json
import math
import time
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from urllib.parse import urlencode

from photo_curator.reference.manifest import Row

API = "https://api.inaturalist.org/v1"
USER_AGENT = "passarim-photo-curator (+https://github.com/velosobr/passarim-photo-curator)"
BRAZIL_PLACE_ID = "6878"  # id do Brasil no iNaturalist (o mesmo do catalog)
# Licenças da política do Passarim (as mesmas do catalog). ND nunca.
LICENSES: tuple[str, ...] = ("cc-by", "cc-by-nc", "cc-by-sa", "cc-by-nc-sa", "cc0")
# Intervalo mínimo entre requisições, em segundos (um pouco acima de 1 s).
MIN_INTERVAL = 1.1
# Teto do tamanho de uma resposta: resposta externa nunca é confiável.
_MAX_BYTES = 20 << 20


@dataclass(frozen=True)
class RemotePhoto:
    """Uma foto candidata, como veio da API (antes de baixar)."""

    photo_id: str
    observation_id: str
    species: str
    author: str
    license: str
    url: str  # página da observação (para a atribuição)
    image_url: str  # arquivo da foto, na versão "large" (1024 px)


def author_of(attribution: str) -> str:
    """Extrai o nome do autor do texto de atribuição da API.

    '(c) desuni, some rights reserved (CC BY-NC)' -> 'desuni'
    """
    text = attribution.strip()
    if text.lower().startswith("(c)"):
        text = text[3:].strip()
    for tail in (", some rights reserved", ", no rights reserved", ", all rights reserved"):
        i = text.lower().find(tail)
        if i >= 0:
            text = text[:i]
    return text.strip() or "desconhecido"


def observation_params(extra: Mapping[str, str], per_page: int) -> dict[str, str]:
    """Parâmetros da busca de observações: sempre no Brasil, com foto, com
    licença aceita e ordenadas pelos votos (as fotos mais "favoritadas" vêm
    primeiro, como no catalog). `extra` acrescenta o filtro de cada busca."""
    params = {
        "place_id": BRAZIL_PLACE_ID,
        "photos": "true",
        "photo_license": ",".join(LICENSES),
        "order_by": "votes",
        "per_page": str(per_page),
    }
    params.update(extra)
    return params


def photos_of(observation: Mapping, max_photos: int) -> list[RemotePhoto]:
    """As fotos aceitas de uma observação, até max_photos. A licença é conferida
    foto a foto: o filtro da API vale para a observação, e uma observação aceita
    pode ter outra foto com licença ND."""
    species = (observation.get("taxon") or {}).get("name", "")
    page = observation.get("uri") or f"https://www.inaturalist.org/observations/{observation['id']}"
    out: list[RemotePhoto] = []
    for p in observation.get("photos", []):
        if len(out) == max_photos:
            break
        if p.get("license_code") not in LICENSES:
            continue
        out.append(
            RemotePhoto(
                photo_id=str(p["id"]),
                observation_id=str(observation["id"]),
                species=species,
                author=author_of(p.get("attribution", "")),
                license=p["license_code"],
                url=page,
                # A API devolve a miniatura quadrada; a "large" tem o mesmo caminho.
                image_url=p["url"].replace("square.", "large.", 1),
            )
        )
    return out


def add_photo(rows: dict[str, Row], photo: RemotePhoto, proposed_label: str, source: str) -> bool:
    """Acrescenta a foto ao manifesto (em memória), se ela ainda não estiver lá.

    Devolve False se já estava: uma foto pode vir de duas buscas, e rodar o
    script de novo não pode apagar um rótulo que o dono já revisou.
    """
    if photo.photo_id in rows:
        return False
    rows[photo.photo_id] = Row(
        photo_id=photo.photo_id,
        observation_id=photo.observation_id,
        species=photo.species,
        proposed_label=proposed_label,
        label="",
        author=photo.author,
        license=photo.license,
        url=photo.url,
        source=source,
    )
    return True


class Client:
    """Cliente mínimo da API, com User-Agent e ritmo de ~1 requisição por segundo.

    sleep e clock podem ser trocados nos testes (para não esperar de verdade).
    time.monotonic é um relógio que só anda para a frente, bom para medir
    intervalos (o relógio do sistema pode ser ajustado e "voltar").
    """

    def __init__(
        self,
        user_agent: str = USER_AGENT,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._user_agent = user_agent
        self._sleep = sleep
        self._clock = clock
        self._last = -math.inf

    def _wait(self) -> None:
        """Espera o que falta para completar MIN_INTERVAL desde a última requisição."""
        remaining = MIN_INTERVAL - (self._clock() - self._last)
        if remaining > 0:
            self._sleep(remaining)
        self._last = self._clock()

    def _open(self, url: str) -> bytes:
        self._wait()
        request = urllib.request.Request(url, headers={"User-Agent": self._user_agent})
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read(_MAX_BYTES + 1)
        if len(data) > _MAX_BYTES:
            raise OSError(f"resposta maior que {_MAX_BYTES} bytes: {url}")
        return data

    def get_json(self, path: str, params: Mapping[str, str]) -> dict:
        return json.loads(self._open(f"{API}{path}?{urlencode(params)}"))

    def get_bytes(self, url: str) -> bytes:
        return self._open(url)

    def taxon_id(self, scientific_name: str) -> str | None:
        """Id do táxon pelo nome científico. A busca é "autocomplete", então só
        aceitamos o primeiro resultado se o nome bater exatamente (como o catalog)."""
        data = self.get_json("/taxa", {"q": scientific_name, "rank": "species", "per_page": "1"})
        results = data.get("results", [])
        if results and results[0].get("name", "").lower() == scientific_name.lower():
            return str(results[0]["id"])
        return None
```

- [ ] **Step 3: Escrever `images.py` e `sources.py`**

`src/photo_curator/reference/images.py`:

```python
"""Reduz uma foto baixada para guardar no conjunto de referência.

512 px no lado maior bastam: o CLIP olha a foto em 224 px e o detector em
640 px. Fotos menores deixam o repositório leve (~30 KB cada).

exif_transpose: câmeras guardam a foto "deitada" e anotam no EXIF (metadados
da imagem) para girar na hora de mostrar. Aplicamos a rotação antes de reduzir,
para a foto ficar de pé como a pessoa a vê.

Quem usa: scripts/build_reference.py.
"""

import io

from PIL import Image, ImageOps

MAX_SIDE = 512


def shrink(data: bytes) -> bytes:
    """Bytes de uma imagem qualquer -> WebP com no máximo MAX_SIDE no lado maior."""
    with Image.open(io.BytesIO(data)) as original:
        image = ImageOps.exif_transpose(original).convert("RGB")
    # thumbnail reduz mantendo a proporção e nunca amplia.
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    image.save(out, format="WEBP", quality=80)  # a mesma qualidade do worker
    return out.getvalue()
```

`src/photo_curator/reference/sources.py`:

```python
"""De onde vêm as fotos do conjunto de referência.

Duas fontes:
- as espécies do Passarim (scripts/species.txt): as fotos mais votadas, que são
  justamente as que o worker vai ver. A sugestão é SINGLE_BIRD;
- os CASOS DIFÍCEIS, buscados de propósito pelas anotações (ave morta, ovo,
  pena, ninho, osso) e pela descrição (anilhamento = ave na mão; bando).

A sugestão (proposed_label) vem da busca, NUNCA do curador: se viesse do
modelo, o dono tenderia a confirmar o que o modelo disse, e a métrica ficaria
otimista. Muita foto de "ninho" mostra o adulto fora dele: o dono corrige.

Para crescer o conjunto (se a medição não tiver o tamanho mínimo), aumente os
números de observações daqui e rode o build_reference.py de novo: as fotos já
baixadas e os rótulos já revisados ficam.

Quem usa: scripts/build_reference.py.
"""

from collections.abc import Mapping
from dataclasses import dataclass

AVES_TAXON_ID = "3"  # "Aves" no iNaturalist: a classe inteira


@dataclass(frozen=True)
class Source:
    name: str  # vai para a coluna "source" do manifesto
    params: Mapping[str, str]  # filtro acrescentado à busca de observações
    proposed_label: str
    observations: int  # quantas observações pedir
    photos_per_observation: int


# Por espécie: 2 observações, 1 foto de cada (a primeira, que é a que o worker
# vê primeiro). 41 espécies dão até 82 fotos.
SPECIES_OBSERVATIONS = 2
SPECIES_PHOTOS = 1


def species_source(taxon_id: str, observations: int = SPECIES_OBSERVATIONS) -> Source:
    # "research": identificação confirmada pela comunidade (como no catalog).
    return Source("species", {"taxon_id": taxon_id, "quality_grade": "research"}, "SINGLE_BIRD", observations, SPECIES_PHOTOS)


def _hard(name: str, label: str, observations: int, **params: str) -> Source:
    # Casos difíceis: qualquer ave, até 2 fotos por observação (a 2ª foto de uma
    # observação de ninho costuma ser o ninho, e a 1ª, o adulto).
    return Source(name, {"taxon_id": AVES_TAXON_ID, **params}, label, observations, 2)


HARD_SOURCES: tuple[Source, ...] = (
    _hard("dead", "DEAD_BIRD", 12, term_id="17", term_value_id="19"),
    _hard("egg", "EGGS", 6, term_id="1", term_value_id="7"),
    _hard("egg", "EGGS", 6, term_id="22", term_value_id="30"),
    _hard("feather", "FEATHER", 12, term_id="22", term_value_id="23"),
    _hard("nest", "NEST", 12, term_id="22", term_value_id="35"),
    _hard("bone", "DEAD_BIRD", 4, term_id="22", term_value_id="27"),
    _hard("in_hand", "OTHER", 4, q="anilhamento", search_on="description"),
    _hard("in_hand", "OTHER", 6, q="banding", search_on="description"),
    _hard("flock", "FLOCK", 12, q="bando", search_on="description"),
)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: todos passam.

- [ ] **Step 5: `scripts/species.txt` e `scripts/build_reference.py`**

`scripts/species.txt` (gerado do catalog; uma espécie por linha, `#` é comentário):

```
# Nomes científicos das 41 espécies do Passarim, tirados de
# passarim-catalog/content/species/*.yaml (campo scientific_name).
# Para atualizar: for f in ../passarim-catalog/content/species/*.yaml; do sed -n 's/^scientific_name: *//p' "$f"; done | sort
Amazona aestiva
Anodorhynchus hyacinthinus
Ara ararauna
Ardea alba
Athene cunicularia
Brotogeris tirica
Caracara plancus
Cariama cristata
Columbina talpacoti
Coragyps atratus
Crotophaga ani
Cyanocorax caeruleus
Cyanopsitta spixii
Cyphorhinus arada
Dryocopus lineatus
Eudocimus ruber
Eupetomena macroura
Eurypyga helias
Furnarius rufus
Guaruba guarouba
Harpia harpyja
Jabiru mycteria
Megaceryle torquata
Mitu mitu
Momotus momota
Paroaria coronata
Pitangus sulphuratus
Pygochelidon cyanoleuca
Ramphastos toco
Ramphocelus bresilia
Rhea americana
Saltator similis
Sicalis flaveola
Tangara seledon
Theristicus caudatus
Thraupis sayaca
Tigrisoma lineatum
Troglodytes musculus
Turdus rufiventris
Tyrannus savana
Vanellus chilensis
```

`scripts/build_reference.py`:

```python
"""Monta (ou cresce) o conjunto de referência: baixa fotos do iNaturalist.

Uso: uv run python scripts/build_reference.py [--out tests/reference]

Para cada busca de reference/sources.py, pede as observações, pega as fotos com
licença aceita, reduz a 512 px (WebP) e acrescenta ao manifesto com a sugestão
de rótulo e o rótulo vazio. Rodar de novo só acrescenta fotos novas: as que já
estão no manifesto (e os rótulos já revisados) ficam como estão.

Leva alguns minutos: a API pede ~1 requisição por segundo, e cada foto é uma
requisição.
"""

import argparse
from pathlib import Path

from photo_curator.reference import images, inat, manifest, sources


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=Path("tests/reference"))
    parser.add_argument("--species-observations", type=int, default=sources.SPECIES_OBSERVATIONS)
    args = parser.parse_args()

    (args.out / "photos").mkdir(parents=True, exist_ok=True)
    manifest_path = args.out / "manifest.csv"
    rows = {r.photo_id: r for r in manifest.read(manifest_path)} if manifest_path.exists() else {}
    client = inat.Client()

    names = [
        line.strip()
        for line in (Path(__file__).parent / "species.txt").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    all_sources: list[sources.Source] = []
    for name in names:
        taxon_id = client.taxon_id(name)
        if taxon_id is None:
            print(f"aviso: {name} não encontrada no iNaturalist; pulando")
            continue
        all_sources.append(sources.species_source(taxon_id, args.species_observations))
    all_sources.extend(sources.HARD_SOURCES)

    for source in all_sources:
        data = client.get_json("/observations", inat.observation_params(source.params, source.observations))
        added = 0
        for observation in data.get("results", []):
            for photo in inat.photos_of(observation, source.photos_per_observation):
                if photo.photo_id in rows:
                    continue
                target = args.out / "photos" / f"{photo.photo_id}.webp"
                try:
                    if not target.exists():
                        target.write_bytes(images.shrink(client.get_bytes(photo.image_url)))
                except OSError as err:
                    # Foto que não baixa ou não abre fica de fora (e não entra no
                    # manifesto, para nunca haver linha sem arquivo).
                    print(f"aviso: foto {photo.photo_id} falhou ({err}); pulando")
                    continue
                added += inat.add_photo(rows, photo, source.proposed_label, source.name)
        print(f"{source.name} {dict(source.params)}: +{added} (total {len(rows)})")

    manifest.write(manifest_path, rows.values())
    (args.out / "ATTRIBUTION.md").write_text(manifest.attribution_markdown(rows.values()), encoding="utf-8")
    print(f"{len(rows)} fotos em {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Em `.gitignore`, acrescentar ao fim:

```gitignore
# Página de revisão montada pelo scripts/make_review_page.py (sai do manifesto).
build/
# Cache das saídas dos modelos no conjunto de referência (reference/features.py).
.cache/
```

Run: `uv run python scripts/build_reference.py --help && uv run ruff check . && uv run ruff format --check .`
Expected: a ajuda aparece; o ruff não acusa nada. (O script de verdade roda na Task 7.)

- [ ] **Step 6: Commit**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: busca de fotos de referência no iNaturalist" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
```

### Task 5: Página de revisão e `apply_review.py`

**Files:**
- Create: `src/photo_curator/reference/review.py`
- Create: `scripts/apply_review.py`, `scripts/make_review_page.py`, `review/index.html`
- Test: `tests/test_reference_review.py`

**Interfaces:**
- Consumes: `Row`, `LABELS`, `EXCLUDED`, `manifest.read/write/image_path` (Task 2).
- Produces:
  - `review.apply(rows: Sequence[Row], decisions: Mapping[str, str]) -> list[Row]`, que levanta `ValueError` para id ou rótulo desconhecido;
  - `review.missing(rows: Sequence[Row]) -> list[str]`, os ids sem rótulo;
  - `scripts/make_review_page.py`, que monta `build/review/` com `index.html`, `reference.json` e `photos/`;
  - a página, que grava no banco do Artifact a coleção `labels`, com o documento `labels/<photo_id>` = `{label: str, at: str}`;
  - o formato de `tests/reference/review.json`: `{"<photo_id>": "<LABEL>", ...}`.

- [ ] **Step 1: Escrever os testes (falham)**

`tests/test_reference_review.py`:

```python
"""Testes da aplicação da revisão do dono ao manifesto."""

import pytest

from photo_curator.reference.manifest import EXCLUDED, Row
from photo_curator.reference.review import apply, missing


def row(photo_id: str, label: str = "") -> Row:
    return Row(photo_id, "1", "sp", "NEST", label, "a", "cc-by", "u", "nest")


def test_apply_fills_labels():
    rows = apply([row("1"), row("2")], {"1": "SINGLE_BIRD", "2": EXCLUDED})
    assert [r.label for r in rows] == ["SINGLE_BIRD", EXCLUDED]


def test_apply_keeps_labels_not_in_review():
    # Uma revisão nova (ex.: só das fotos acrescentadas) não apaga as antigas.
    assert apply([row("1", "EGGS"), row("2")], {"2": "NEST"})[0].label == "EGGS"


def test_apply_rejects_unknown_photo():
    with pytest.raises(ValueError, match="99"):
        apply([row("1")], {"99": "NEST"})


def test_apply_rejects_unknown_label():
    with pytest.raises(ValueError, match="PASSARO"):
        apply([row("1")], {"1": "PASSARO"})


def test_missing_lists_unlabeled():
    assert missing([row("1", "NEST"), row("2"), row("3")]) == ["2", "3"]
```

Run: `uv run pytest tests/test_reference_review.py -q`
Expected: FAIL com `ModuleNotFoundError: No module named 'photo_curator.reference.review'`.

- [ ] **Step 2: Escrever `review.py` e `scripts/apply_review.py`**

`src/photo_curator/reference/review.py`:

```python
"""Aplica a revisão do dono ao manifesto.

O dono rotula as fotos na página de revisão (review/index.html). O executor
exporta o banco da página para tests/reference/review.json, no formato
{"<photo_id>": "<RÓTULO>"}, e este módulo copia cada rótulo para a coluna
"label" do manifesto.

Recusa id ou rótulo desconhecido em vez de gravar: um erro na exportação não
pode virar silenciosamente um rótulo errado na métrica.

Quem usa: scripts/apply_review.py.
"""

from collections.abc import Mapping, Sequence
from dataclasses import replace

from photo_curator.reference.manifest import EXCLUDED, LABELS, Row

_VALID = frozenset({*LABELS, EXCLUDED})


def apply(rows: Sequence[Row], decisions: Mapping[str, str]) -> list[Row]:
    """Devolve as linhas com o rótulo da revisão; as que a revisão não cita
    ficam com o rótulo que já tinham."""
    unknown = sorted(set(decisions) - {r.photo_id for r in rows})
    if unknown:
        raise ValueError(f"fotos que não estão no manifesto: {', '.join(unknown)}")
    bad = sorted({label for label in decisions.values() if label not in _VALID})
    if bad:
        raise ValueError(f"rótulos desconhecidos: {', '.join(bad)}")
    return [replace(r, label=decisions.get(r.photo_id, r.label)) for r in rows]


def missing(rows: Sequence[Row]) -> list[str]:
    """Os ids das fotos ainda sem rótulo."""
    return [r.photo_id for r in rows if not r.label]
```

`scripts/apply_review.py`:

```python
"""Copia a revisão do dono (tests/reference/review.json) para o manifesto.

Uso: uv run python scripts/apply_review.py [--reference tests/reference]

Sai com erro (1) se ainda houver foto sem rótulo, dizendo quantas: a divisão e
as métricas só valem com o conjunto inteiro revisado.
"""

import argparse
import json
from pathlib import Path

from photo_curator.reference import manifest, review


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--reference", type=Path, default=Path("tests/reference"))
    args = parser.parse_args()

    path = args.reference / "manifest.csv"
    decisions = json.loads((args.reference / "review.json").read_text(encoding="utf-8"))
    rows = review.apply(manifest.read(path), decisions)
    manifest.write(path, rows)
    left = review.missing(rows)
    print(f"{len(rows) - len(left)} fotos rotuladas; {len(left)} sem rótulo")
    if left:
        print("sem rótulo:", ", ".join(left[:20]), "..." if len(left) > 20 else "")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3: Rodar e ver passar**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: todos passam.

- [ ] **Step 4: `scripts/make_review_page.py`**

```python
"""Monta a página de revisão em build/review/, pronta para publicar como Artifact.

Uso: uv run python scripts/make_review_page.py [--reference tests/reference]

Gera:
- build/review/index.html: cópia de review/index.html (a página);
- build/review/reference.json: as fotos do manifesto, com a sugestão e o
  rótulo atual (a página lê este arquivo);
- build/review/photos/<photo_id>.webp: cópia das fotos.

A publicação é feita pelo executor com a ferramenta Artifact, declarando a
capacidade "db" (banco compartilhado, onde a página grava os rótulos).
"""

import argparse
import json
import shutil
from dataclasses import asdict
from pathlib import Path

from photo_curator.reference import manifest

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--reference", type=Path, default=ROOT / "tests" / "reference")
    parser.add_argument("--out", type=Path, default=ROOT / "build" / "review")
    args = parser.parse_args()

    rows = manifest.read(args.reference / "manifest.csv")
    if args.out.exists():
        shutil.rmtree(args.out)  # sempre do zero: nada de foto velha sobrando
    (args.out / "photos").mkdir(parents=True)
    shutil.copyfile(ROOT / "review" / "index.html", args.out / "index.html")
    for r in rows:
        shutil.copyfile(manifest.image_path(args.reference, r), args.out / "photos" / f"{r.photo_id}.webp")
    (args.out / "reference.json").write_text(
        json.dumps([asdict(r) for r in rows], ensure_ascii=False), encoding="utf-8"
    )
    print(f"{len(rows)} fotos em {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: `review/index.html`**

Antes de escrever, carregar a skill `artifact-design` (contrato de título, tokens de cor, tema escuro e largura de celular). A página abaixo já segue esse contrato; ajustar só o que a skill exigir a mais.

```html
<!doctype html>
<!--
  review/index.html — página de revisão do conjunto de referência do curador.

  Quem usa: o dono do Passarim, no claude.ai (publicada como Artifact pelo
  executor do plano A2, com a capacidade "db").

  Como funciona:
  - lê reference.json (gerado pelo scripts/make_review_page.py) e mostra as
    fotos em grade, cada uma com a sugestão de rótulo (borda tracejada);
  - um toque num rótulo grava a escolha no banco compartilhado do Artifact,
    coleção "labels", documento "labels/<photo_id>" = {label, at};
  - o banco avisa a página a cada mudança (onSnapshot), então dá para revisar
    em dois aparelhos ao mesmo tempo;
  - o executor exporta a coleção "labels" para tests/reference/review.json.

  Sem biblioteca: HTML, CSS e JavaScript simples. Os textos que vêm dos dados
  entram com textContent (nunca innerHTML), para um nome estranho nunca virar
  código na página.
-->
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Revisão de fotos</title>
<style>
  /* Cores como "tokens" (variáveis CSS): o tema escuro só troca os valores. */
  :root {
    --bg: #f6f5f0; --card: #ffffff; --text: #1d1d1b; --muted: #66665f;
    --line: #dddbd2; --accent: #2f6f4f; --accent-text: #ffffff; --hint: #a2541c;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #151513; --card: #201f1c; --text: #ecebe6; --muted: #a3a29b;
      --line: #36352f; --accent: #6fbf8f; --accent-text: #0d1f15; --hint: #e39a5f;
    }
  }
  :root[data-theme="dark"] {
    --bg: #151513; --card: #201f1c; --text: #ecebe6; --muted: #a3a29b;
    --line: #36352f; --accent: #6fbf8f; --accent-text: #0d1f15; --hint: #e39a5f;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.4 system-ui, sans-serif; }
  header { position: sticky; top: 0; z-index: 1; background: var(--bg); border-bottom: 1px solid var(--line); padding: 12px 16px; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  h1 { font-size: 17px; margin: 0 8px 0 0; }
  .status { font-size: 13px; color: var(--muted); margin: 6px 0 0; }
  select, .action { font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--text); }
  .action.armed { border-color: var(--hint); color: var(--hint); }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; padding: 16px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .card.done { border-color: var(--accent); }
  .card img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: var(--line); }
  .meta { padding: 8px 10px 4px; font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
  .meta a { color: inherit; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 10px 10px; }
  .chip { font: inherit; font-size: 12px; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: var(--text); cursor: pointer; }
  .chip.proposed { border-style: dashed; border-color: var(--hint); }
  .chip.on { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
</style>
</head>
<body>
<header>
  <div class="bar">
    <h1>Revisão de fotos</h1>
    <select id="filter" aria-label="Filtro"></select>
    <button id="accept" class="action" type="button">Aceitar sugestões visíveis</button>
  </div>
  <p id="status" class="status">Carregando…</p>
</header>
<main id="grid"></main>
<script>
// Rótulos possíveis: as categorias do contrato (menos UNSPECIFIED) e "ignorar".
const LABELS = [
  ["SINGLE_BIRD", "Ave sozinha"], ["FLOCK", "Bando"], ["NEST", "Ninho"], ["EGGS", "Ovos"],
  ["FEATHER", "Pena"], ["DEAD_BIRD", "Ave morta"], ["NO_BIRD", "Sem ave"], ["OTHER", "Outro"],
  ["EXCLUDED", "Ignorar"],
];
const NAMES = Object.fromEntries(LABELS);

let photos = [];            // linhas do manifesto (reference.json)
const chosen = new Map();   // photo_id -> rótulo escolhido no banco
let labelsCollection = null; // coleção "labels" do banco (null sem banco)
let armedUntil = 0;         // "aceitar sugestões" pede um segundo toque

const $ = (id) => document.getElementById(id);

// O rótulo que vale para uma foto: o do banco; senão, o que o manifesto já
// tinha (de uma revisão anterior); senão, nenhum.
function currentLabel(p) { return chosen.get(p.photo_id) || p.label || ""; }

function visiblePhotos() {
  const f = $("filter").value;
  if (f === "todo") return photos.filter((p) => !currentLabel(p));
  if (f === "all") return photos;
  return photos.filter((p) => (currentLabel(p) || p.proposed_label) === f);
}

function setupFilter() {
  const options = [["todo", "Não revisadas"], ["all", "Todas"], ...LABELS];
  for (const [value, text] of options) {
    const o = document.createElement("option");
    o.value = value; o.textContent = text;
    $("filter").append(o);
  }
  $("filter").addEventListener("change", render);
}

function render() {
  const done = photos.filter((p) => currentLabel(p)).length;
  const base = `${done} de ${photos.length} revisadas`;
  $("status").textContent = labelsCollection ? base : `${base} · sem banco: as escolhas não são gravadas`;
  const grid = $("grid");
  grid.replaceChildren();
  for (const p of visiblePhotos()) grid.append(card(p));
}

function card(p) {
  const label = currentLabel(p);
  const el = document.createElement("article");
  el.className = "card" + (label ? " done" : "");

  const img = document.createElement("img");
  img.src = `photos/${p.photo_id}.webp`;
  img.alt = p.species;
  img.loading = "lazy"; // só baixa quando a foto chega perto da tela
  el.append(img);

  const meta = document.createElement("div");
  meta.className = "meta";
  const link = document.createElement("a");
  link.href = p.url; link.target = "_blank"; link.rel = "noopener";
  link.textContent = "iNaturalist";
  meta.append(`${p.species} · ${p.source} · `, link);
  el.append(meta);

  const chips = document.createElement("div");
  chips.className = "chips";
  for (const [value, text] of LABELS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (value === label ? " on" : "") + (value === p.proposed_label ? " proposed" : "");
    b.textContent = text;
    b.addEventListener("click", () => choose(p.photo_id, value));
    chips.append(b);
  }
  el.append(chips);
  return el;
}

async function choose(photoId, label) {
  if (!labelsCollection) return;
  chosen.set(photoId, label); // mostra na hora; o banco confirma pelo onSnapshot
  render();
  try {
    await labelsCollection.doc(photoId).set({ label, at: new Date().toISOString() });
  } catch (e) {
    $("status").textContent = `Não gravou a foto ${photoId}: ${e.message || e}`;
  }
}

// Aceita a sugestão de todas as fotos visíveis ainda sem rótulo. Pede um
// segundo toque em até 4 s (sem janela de confirmação do navegador).
async function acceptVisible() {
  if (!labelsCollection) return;
  const btn = $("accept");
  if (Date.now() > armedUntil) {
    armedUntil = Date.now() + 4000;
    btn.classList.add("armed");
    btn.textContent = "Toque de novo para confirmar";
    setTimeout(() => { btn.classList.remove("armed"); btn.textContent = "Aceitar sugestões visíveis"; }, 4000);
    return;
  }
  armedUntil = 0;
  btn.classList.remove("armed");
  btn.textContent = "Aceitar sugestões visíveis";
  const todo = visiblePhotos().filter((p) => !currentLabel(p));
  for (const p of todo) await choose(p.photo_id, p.proposed_label);
}

async function start() {
  setupFilter();
  $("accept").addEventListener("click", acceptVisible);
  photos = await (await fetch("reference.json")).json();
  render();
  // claude.use("db") devolve o banco, ou null quando a página roda fora do
  // claude.ai (ou sem permissão): aí ela só mostra as fotos.
  const db = window.claude ? await window.claude.use("db") : null;
  if (!db) { render(); return; }
  labelsCollection = db.collection("labels");
  labelsCollection.limit(1000).onSnapshot(
    (snap) => {
      chosen.clear();
      for (const d of snap.docs) chosen.set(d.id, d.data().label);
      render();
    },
    (e) => { $("status").textContent = `Banco indisponível: ${e.message || e}`; },
  );
}

start();
</script>
</body>
</html>
```

Run: `uv run ruff check . && uv run pytest -q`
Expected: tudo passa. (A página é publicada e testada de verdade na Task 7.)

- [ ] **Step 6: Commit**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: página de revisão e aplicação da revisão ao manifesto" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
```

### Task 6: Características em cache, busca dos limites, `calibrate.py` e `measure.py`

**Files:**
- Create: `src/photo_curator/reference/features.py`, `src/photo_curator/reference/calibrate.py`
- Create: `scripts/calibrate.py`, `scripts/measure.py`
- Test: `tests/test_reference_features.py`, `tests/test_reference_calibrate.py`

**Interfaces:**
- Consumes:
  - `Thresholds` e `DEFAULT_THRESHOLDS` (Task 1);
  - `curate` e `largest_box` (rules), `measure` (sharpness);
  - `Row` e `image_path` (Task 2), `split` e `check_minimum` (Task 2);
  - `evaluate` e `Report` (Task 3);
  - `weights.FILES`, `RTDETR_SUBDIR` e `CLIP_FILE`, `RtDetrDetector`, `ClipZeroShot` e `prompts.flat_prompts` (plano A1).
- Produces (`features`):
  - `@dataclass(frozen=True) class Features` com `boxes: tuple[Box, ...]`, `clip: dict[str, float]`, `sharpness: float`, `width: int` e `height: int`;
  - `predict(f: Features, thresholds: Thresholds = DEFAULT_THRESHOLDS) -> str`;
  - `cache_key() -> str`;
  - `compute_all(rows: Sequence[Row], folder: Path, detector, zeroshot, cache_path: Path) -> dict[str, Features]`;
  - `load_models(models_dir: Path) -> tuple[Detector, ZeroShot]`.
- Produces (`calibrate`):
  - `PARAMS: tuple[str, ...]`, `GRID: dict[str, tuple[float, ...]]`;
  - `with_param(t: Thresholds, param: str, value: float) -> Thresholds`;
  - `report_for(samples: Sequence[tuple[str, Features]], t: Thresholds) -> Report`;
  - `search(samples, start: Thresholds = DEFAULT_THRESHOLDS, passes: int = 2) -> tuple[Thresholds, Report]`;
  - `config_snippet(t: Thresholds) -> str`.

- [ ] **Step 1: Escrever os testes (falham)**

`tests/test_reference_features.py`:

```python
"""Testes das características em cache (com modelos falsos e imagens sintéticas)."""

import dataclasses

import pytest
from PIL import Image

from photo_curator import config
from photo_curator.reference import features as ft
from photo_curator.reference.manifest import Row
from photo_curator.types import CLIP_CLASSES, Box


def row(photo_id: str) -> Row:
    return Row(photo_id, "1", "sp", "SINGLE_BIRD", "SINGLE_BIRD", "a", "cc-by", "u", "species")


class CountingDetector:
    def __init__(self):
        self.calls = 0

    def detect(self, image):
        self.calls += 1
        return [Box(10, 10, 100, 80, 0.9)]


class FakeZeroShot:
    def classify(self, image):
        scores = dict.fromkeys(CLIP_CLASSES, 0.0)
        scores["single"] = 1.0
        return scores


def write_photo(folder, photo_id):
    (folder / "photos").mkdir(exist_ok=True)
    Image.new("RGB", (200, 150), (50, 90, 40)).save(folder / "photos" / f"{photo_id}.webp", format="WEBP")


def test_compute_all_uses_cache(tmp_path):
    write_photo(tmp_path, "1")
    detector, cache = CountingDetector(), tmp_path / "cache.json"
    first = ft.compute_all([row("1")], tmp_path, detector, FakeZeroShot(), cache)
    second = ft.compute_all([row("1")], tmp_path, detector, FakeZeroShot(), cache)
    assert detector.calls == 1  # a segunda vez veio do cache
    assert first == second
    assert ft.predict(first["1"]) == "SINGLE_BIRD"
    assert first["1"].width == 200


def test_cache_with_other_key_is_ignored(tmp_path, monkeypatch):
    write_photo(tmp_path, "1")
    detector, cache = CountingDetector(), tmp_path / "cache.json"
    ft.compute_all([row("1")], tmp_path, detector, FakeZeroShot(), cache)
    monkeypatch.setattr(ft, "cache_key", lambda: "outra-versão-dos-modelos")
    ft.compute_all([row("1")], tmp_path, detector, FakeZeroShot(), cache)
    assert detector.calls == 2


def test_compute_all_fails_on_missing_image(tmp_path):
    with pytest.raises(FileNotFoundError, match="42"):
        ft.compute_all([row("42")], tmp_path, CountingDetector(), FakeZeroShot(), tmp_path / "c.json")


def test_predict_uses_given_thresholds():
    f = ft.Features(boxes=(), clip={**dict.fromkeys(CLIP_CLASSES, 0.0), "flock": 0.7}, sharpness=0.5, width=100, height=100)
    assert ft.predict(f) == "FLOCK"
    assert ft.predict(f, dataclasses.replace(config.DEFAULT_THRESHOLDS, flock_min=0.8)) == "OTHER"
```

`tests/test_reference_calibrate.py`:

```python
"""Testes da busca dos limites com características sintéticas."""

import pytest

from photo_curator import config
from photo_curator.reference import calibrate as cal
from photo_curator.reference.features import Features
from photo_curator.types import CLIP_CLASSES, Box


def feats(boxes=(), **clip: float) -> Features:
    scores = dict.fromkeys(CLIP_CLASSES, 0.0)
    scores.update(clip)
    return Features(boxes=tuple(boxes), clip=scores, sharpness=0.5, width=800, height=600)


BIRD = [Box(200, 150, 600, 450, 0.95)]
# 20 aves sozinhas claras e 20 fotos de ovos em que o CLIP dá só 0,4 para "eggs"
# (abaixo do limite padrão de 0,5): com o padrão, os ovos viram ave sozinha.
SAMPLES = [("SINGLE_BIRD", feats(BIRD, single=1.0))] * 20 + [("EGGS", feats(BIRD, eggs=0.4, single=0.6))] * 20


def test_default_thresholds_miss_the_eggs():
    report = cal.report_for(SAMPLES, config.DEFAULT_THRESHOLDS)
    assert report.discard_recall.value == 0.0


def test_search_lowers_the_eggs_threshold_just_enough():
    best, report = cal.search(SAMPLES)
    assert report.failures() == []
    # 0,4 é o valor da grade mais perto do padrão (0,5) que pega os ovos.
    assert best.discard_min["eggs"] == pytest.approx(0.4)
    # Os outros limites não tinham motivo para mudar.
    assert best.flock_min == config.FLOCK_MIN


def test_with_param_changes_one_discard_class():
    t = cal.with_param(config.DEFAULT_THRESHOLDS, "discard_min.nest", 0.3)
    assert t.discard_min["nest"] == 0.3
    assert t.discard_min["eggs"] == config.DISCARD_MIN["eggs"]
    assert config.DEFAULT_THRESHOLDS.discard_min["nest"] == config.DISCARD_MIN["nest"]  # o padrão não mudou


def test_config_snippet_is_valid_python():
    namespace: dict = {}
    # exec roda o texto como código Python: prova que o trecho cola sem erro no config.py.
    exec(cal.config_snippet(config.DEFAULT_THRESHOLDS), namespace)
    assert namespace["FLOCK_MIN"] == config.FLOCK_MIN
    assert namespace["DISCARD_MIN"] == config.DISCARD_MIN
```

Run: `uv run pytest tests/test_reference_features.py tests/test_reference_calibrate.py -q`
Expected: FAIL com `ModuleNotFoundError` (`features` e `calibrate` não existem).

- [ ] **Step 2: Escrever `features.py`**

```python
"""As "características" de cada foto: o que os modelos viram, guardado em cache.

Rodar o detector e o CLIP leva ~0,5 s por foto. A regra (rules.curate), ao
contrário, é instantânea. Então rodamos os modelos UMA vez por foto, guardamos
as saídas (caixas, probabilidades do CLIP, nitidez e tamanho) num arquivo
JSON, e a calibração experimenta milhares de combinações de limites só com a
regra.

O cache tem uma CHAVE: o hash dos pesos, das frases do CLIP e da confiança
mínima do detector. Se qualquer um mudar, as saídas mudam, e o cache antigo é
ignorado (senão a calibração usaria saídas de outro modelo).

Quem usa: reference/calibrate.py, scripts/calibrate.py e scripts/measure.py.
"""

import hashlib
import json
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from photo_curator import config, weights
from photo_curator.config import DEFAULT_THRESHOLDS, Thresholds
from photo_curator.models import Detector, ZeroShot
from photo_curator.prompts import flat_prompts
from photo_curator.reference.manifest import Row, image_path
from photo_curator.rules import curate, largest_box
from photo_curator.sharpness import measure
from photo_curator.types import Box


@dataclass(frozen=True)
class Features:
    boxes: tuple[Box, ...]
    clip: dict[str, float]
    sharpness: float
    width: int
    height: int


def predict(f: Features, thresholds: Thresholds = DEFAULT_THRESHOLDS) -> str:
    """A categoria que a regra dá para estas características, pelo nome."""
    return curate(f.boxes, f.clip, f.sharpness, f.width, f.height, thresholds).category.name


def cache_key() -> str:
    """Identifica "o que os modelos são": pesos, frases e confiança do detector."""
    payload = {
        "weights": [w.sha256 for w in weights.FILES],
        "prompts": flat_prompts(),
        "detector_min_score": config.DETECTOR_MIN_SCORE,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def _to_json(f: Features) -> dict:
    return {
        "boxes": [[b.x0, b.y0, b.x1, b.y1, b.score] for b in f.boxes],
        "clip": f.clip,
        "sharpness": f.sharpness,
        "width": f.width,
        "height": f.height,
    }


def _from_json(d: dict) -> Features:
    return Features(
        boxes=tuple(Box(*b) for b in d["boxes"]),
        clip={k: float(v) for k, v in d["clip"].items()},
        sharpness=float(d["sharpness"]),
        width=int(d["width"]),
        height=int(d["height"]),
    )


def _load_cache(path: Path) -> dict[str, Features]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("key") != cache_key():
        return {}
    return {photo_id: _from_json(d) for photo_id, d in data["photos"].items()}


def _save_cache(path: Path, cached: dict[str, Features]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {"key": cache_key(), "photos": {k: _to_json(v) for k, v in sorted(cached.items())}}
    path.write_text(json.dumps(data), encoding="utf-8")


def compute_all(
    rows: Sequence[Row], folder: Path, detector: Detector, zeroshot: ZeroShot, cache_path: Path
) -> dict[str, Features]:
    """As características de cada linha, do cache ou rodando os modelos.

    Uma foto sem arquivo é ERRO (FileNotFoundError com o id), nunca é pulada:
    pular mudaria a métrica sem ninguém perceber.
    """
    cached = _load_cache(cache_path)
    out: dict[str, Features] = {}
    for r in rows:
        if r.photo_id not in cached:
            path = image_path(folder, r)
            if not path.is_file():
                raise FileNotFoundError(f"a foto {r.photo_id} do manifesto não tem arquivo em {path}")
            with Image.open(path) as original:
                image = original.convert("RGB")
            boxes = tuple(detector.detect(image))
            cached[r.photo_id] = Features(
                boxes=boxes,
                clip=dict(zeroshot.classify(image)),
                sharpness=measure(image, largest_box(boxes)),
                width=image.width,
                height=image.height,
            )
        out[r.photo_id] = cached[r.photo_id]
    _save_cache(cache_path, cached)
    return out


def load_models(models_dir: Path) -> tuple[Detector, ZeroShot]:
    """Confere os pesos e carrega os dois modelos (alguns segundos)."""
    # Import aqui dentro: torch e transformers só carregam quando há modelo de
    # verdade (os testes deste módulo usam modelos falsos).
    from photo_curator.detector import RtDetrDetector
    from photo_curator.zeroshot import ClipZeroShot

    weights.verify(models_dir)
    return RtDetrDetector(models_dir / weights.RTDETR_SUBDIR), ClipZeroShot(models_dir / weights.CLIP_FILE)
```

- [ ] **Step 3: Escrever `calibrate.py`**

```python
"""A busca dos limites da regra na metade de calibração.

BUSCA COORDENADA: em vez de testar todas as combinações de 11 limites (seriam
trilhões), mexemos em UM limite por vez. Para cada limite, testamos os valores
da grade com os outros parados, ficamos com o melhor e passamos ao próximo.
Damos duas voltas completas, porque mudar um limite pode mudar qual é o melhor
valor de outro.

"Melhor", nesta ordem:
1. o menor déficit das metas (0 = todas atingidas, ver Report.deficit);
2. a maior revocação de SINGLE_BIRD (mais fotos boas aproveitadas);
3. a maior acurácia geral;
4. a menor distância dos limites padrão, para não mexer sem motivo.

Isto roda SÓ na metade de calibração. Rodar na medição e copiar os limites
seria "decorar" a prova (ver reference/split.py).

Quem usa: scripts/calibrate.py.
"""

from collections.abc import Sequence
from dataclasses import replace

from photo_curator.config import DEFAULT_THRESHOLDS, Thresholds
from photo_curator.reference.features import Features, predict
from photo_curator.reference.metrics import Report, evaluate


def _steps(start: float, stop: float, step: float) -> tuple[float, ...]:
    """Valores de start a stop (inclusive), arredondados para não acumular erro
    de ponto flutuante (0,1 + 0,2 não é exatamente 0,3 no computador)."""
    n = round((stop - start) / step)
    return tuple(round(start + i * step, 4) for i in range(n + 1))


_PROB = _steps(0.2, 0.9, 0.05)
_DISCARD_CLASSES = tuple(DEFAULT_THRESHOLDS.discard_min)

# Os limites calibrados. "discard_min.<classe>" é o limite de uma classe de descarte.
PARAMS: tuple[str, ...] = (
    *(f"discard_min.{c}" for c in _DISCARD_CLASSES),
    "flock_min",
    "no_bird_min",
    "no_bird_strong",
    "weak_detection",
    "dominance",
)
GRID: dict[str, tuple[float, ...]] = {
    **{f"discard_min.{c}": _PROB for c in _DISCARD_CLASSES},
    "flock_min": _PROB,
    "no_bird_min": _PROB,
    "no_bird_strong": _steps(0.6, 0.95, 0.05),
    "weak_detection": _steps(0.5, 0.9, 0.05),
    "dominance": (2.0, 3.0, 4.0, 5.0, 6.0, 8.0),
}


def _get(t: Thresholds, param: str) -> float:
    if param.startswith("discard_min."):
        return t.discard_min[param.split(".", 1)[1]]
    return getattr(t, param)


def with_param(t: Thresholds, param: str, value: float) -> Thresholds:
    """Uma cópia de t com um limite trocado (t não muda: Thresholds é imutável)."""
    if param.startswith("discard_min."):
        discard = dict(t.discard_min)
        discard[param.split(".", 1)[1]] = value
        return replace(t, discard_min=discard)
    return replace(t, **{param: value})


def report_for(samples: Sequence[tuple[str, Features]], t: Thresholds) -> Report:
    """As métricas dos limites t nas amostras (rótulo, características)."""
    return evaluate((label, predict(f, t)) for label, f in samples)


def _distance(t: Thresholds) -> float:
    return sum(abs(_get(t, p) - _get(DEFAULT_THRESHOLDS, p)) for p in PARAMS)


def _rank(t: Thresholds, report: Report) -> tuple[float, float, float, float]:
    # max() escolhe a maior tupla; por isso os itens "quanto menor, melhor" vão negativos.
    return (-report.deficit(), report.single_recall.value, report.accuracy.value, -_distance(t))


def search(
    samples: Sequence[tuple[str, Features]], start: Thresholds = DEFAULT_THRESHOLDS, passes: int = 2
) -> tuple[Thresholds, Report]:
    """Os melhores limites (e o relatório deles) pela busca coordenada."""
    best = start
    best_report = report_for(samples, best)
    for _ in range(passes):
        for param in PARAMS:
            for value in GRID[param]:
                candidate = with_param(best, param, value)
                report = report_for(samples, candidate)
                if _rank(candidate, report) > _rank(best, best_report):
                    best, best_report = candidate, report
    return best, best_report


def config_snippet(t: Thresholds) -> str:
    """O trecho para colar no config.py, no lugar das constantes atuais."""
    discard = ",\n".join(f'    "{c}": {t.discard_min[c]}' for c in _DISCARD_CLASSES)
    return (
        f"DISCARD_MIN: dict[str, float] = {{\n{discard},\n}}\n"
        f"FLOCK_MIN = {t.flock_min}\n"
        f"NO_BIRD_MIN = {t.no_bird_min}\n"
        f"NO_BIRD_STRONG = {t.no_bird_strong}\n"
        f"WEAK_DETECTION = {t.weak_detection}\n"
        f"DOMINANCE = {t.dominance}\n"
    )
```

- [ ] **Step 4: Rodar e ver passar**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: todos passam. Se `test_search_lowers_the_eggs_threshold_just_enough` achar outro valor, conferir a ordem do `_rank` antes de mexer no teste: o desempate pela distância é o que leva ao 0,4.

- [ ] **Step 5: `scripts/calibrate.py` e `scripts/measure.py`**

`scripts/calibrate.py`:

```python
"""Calibra os limites do config.py na metade de CALIBRAÇÃO.

Uso: CURATOR_MODELS_DIR=models uv run python scripts/calibrate.py

Imprime o relatório antes e depois e o trecho para colar no config.py. Não
olha a metade de medição (ver reference/split.py). As saídas dos modelos ficam
em .cache/reference-features.json: a segunda execução é instantânea.
"""

import os
import sys
from pathlib import Path

from photo_curator.config import DEFAULT_THRESHOLDS
from photo_curator.reference import calibrate, features, manifest, split

REFERENCE = Path("tests/reference")
CACHE = Path(".cache/reference-features.json")


def main() -> int:
    models_dir = os.environ.get("CURATOR_MODELS_DIR")
    if not models_dir:
        sys.exit("defina CURATOR_MODELS_DIR (pasta dos pesos)")
    rows = manifest.read(REFERENCE / "manifest.csv")
    half = split.split(rows)[split.CALIBRATION]
    detector, zeroshot = features.load_models(Path(models_dir))
    feats = features.compute_all(half, REFERENCE, detector, zeroshot, CACHE)
    samples = [(r.label, feats[r.photo_id]) for r in half]

    print(f"calibração: {len(samples)} fotos\n\n## Limites atuais\n")
    print(calibrate.report_for(samples, DEFAULT_THRESHOLDS).markdown())
    best, report = calibrate.search(samples)
    print("## Limites calibrados\n")
    print(report.markdown())
    print("## Para o config.py\n")
    print(calibrate.config_snippet(best))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

`scripts/measure.py`:

```python
"""Mede o curador na metade de MEDIÇÃO e reprova abaixo das metas.

Uso: CURATOR_MODELS_DIR=models uv run python scripts/measure.py

Usa os limites do config.py (os do serviço). Escreve o resumo na saída e, na
CI, também em $GITHUB_STEP_SUMMARY (o resumo que aparece na página do job do
GitHub Actions). Sai com 1 se a medição for pequena demais ou se uma meta não
for atingida.
"""

import os
import sys
from pathlib import Path

from photo_curator import config
from photo_curator.reference import features, manifest, metrics, split

REFERENCE = Path("tests/reference")
CACHE = Path(".cache/reference-features.json")


def main() -> int:
    models_dir = os.environ.get("CURATOR_MODELS_DIR")
    if not models_dir:
        sys.exit("defina CURATOR_MODELS_DIR (pasta dos pesos)")
    rows = manifest.read(REFERENCE / "manifest.csv")
    half = split.split(rows)[split.MEASUREMENT]
    problems = split.check_minimum(half)
    if problems:
        print("medição pequena demais:", *problems, sep="\n  ")
        return 1

    detector, zeroshot = features.load_models(Path(models_dir))
    feats = features.compute_all(half, REFERENCE, detector, zeroshot, CACHE)
    report = metrics.evaluate((r.label, features.predict(feats[r.photo_id])) for r in half)

    text = f"## Curador na metade de medição ({len(half)} fotos, {config.MODEL_VERSION})\n\n{report.markdown()}"
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(text)
    failures = report.failures()
    if failures:
        print("abaixo das metas:", *failures, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Run: `uv run ruff check . && uv run ruff format --check . && uv run pytest -q`
Expected: tudo passa.

- [ ] **Step 6: Commit, PR 5a e merge**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: características em cache, calibração e medição" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
git push -u origin feat/ferramentas-referencia
gh pr create --base main --title "feat: ferramentas do conjunto de referência" --body "<resumo: Thresholds, manifesto, divisão, métricas, busca no iNaturalist, página de revisão, calibração e medição; PR 5a da frente A>"
```

Expected: a CI fica verde (`test`, `models`, `security`). Depois, merge.

---

## Parte 2 — o conjunto de verdade (PR 5b, `feat/conjunto-de-referencia`)

Esta parte tem uma **parada para o dono** (a revisão na página). O executor não segue para a calibração antes de o dono dizer que terminou.

### Task 7: Montar o conjunto, publicar a página e aplicar a revisão

**Files:**
- Create: `tests/reference/manifest.csv`, `tests/reference/ATTRIBUTION.md`, `tests/reference/photos/*.webp`, `tests/reference/review.json`

**Interfaces:**
- Consumes: os scripts das Tasks 4 e 5, a ferramenta Artifact (publicação com `capabilities: {db: {}}`) e a ferramenta `ArtifactData` (ação `list` da coleção `labels`).
- Produces: o manifesto com a coluna `label` preenchida em todas as linhas; a metade de medição com o tamanho mínimo.

- [ ] **Step 1: Branch e download**

```bash
cd ~/dev/passarim/passarim-photo-curator && git switch main && git pull --ff-only && git switch -c feat/conjunto-de-referencia
uv run python scripts/build_reference.py
```

Expected: uma linha por busca (`species ...: +1`, `dead ...: +N` etc.) e, no fim, algo entre 180 e 260 fotos. `ls tests/reference/photos | wc -l` dá o mesmo número das linhas do manifesto (menos o cabeçalho).

- [ ] **Step 2: Montar e publicar a página**

```bash
uv run python scripts/make_review_page.py
```

Expected: `N fotos em .../build/review`.

Publicar com a ferramenta Artifact:
- `file_path`: `build/review/index.html`;
- `files`: `reference.json` e cada `photos/<id>.webp`, mapeados para os arquivos em `build/review/`. Se passar de 254 arquivos, publicar em duas vezes na mesma `url`;
- `capabilities: {"db": {}}`;
- `icon: "photo"`;
- `description`: "Revisão das fotos de referência do curador do Passarim".

Conferência funcional, uma vez: marcar uma foto pela ferramenta `ArtifactData` (`set` em `labels/<um photo_id>` com `{"label": "SINGLE_BIRD", "at": "teste"}`), ler com `list` da coleção `labels`, e apagar (`delete`). Expected: o `list` mostra o documento, e depois do `delete` a coleção volta vazia.

- [ ] **Step 3: PARADA — o dono revisa**

Mandar o link ao dono, em português, dizendo:
- quantas fotos são;
- que a borda tracejada é a sugestão, e um toque escolhe o rótulo;
- que "Ignorar" tira a foto da conta;
- que "Aceitar sugestões visíveis" serve para confirmar de uma vez as fotos de um filtro que ele já conferiu;
- que é para avisar quando terminar.

**Não seguir até o dono dizer que terminou.**

- [ ] **Step 4: Exportar e aplicar**

Ler a coleção `labels` com `ArtifactData` (`list`, paginando até o fim) e gravar `tests/reference/review.json` como `{"<photo_id>": "<label>"}`: um objeto JSON com as chaves em ordem numérica de `photo_id`, uma por linha (`json.dumps(dict(sorted(decisions.items(), key=lambda kv: int(kv[0]))), indent=1)`), para o diff do PR ser legível. Então:

```bash
uv run python scripts/apply_review.py
```

Expected: `N fotos rotuladas; 0 sem rótulo`. Se sobrar foto sem rótulo, mandar ao dono a lista (o filtro "Não revisadas" da página mostra as mesmas) e repetir o Step 4.

- [ ] **Step 5: Conferir o tamanho da medição**

```bash
uv run python -c "
from pathlib import Path
from photo_curator.reference import manifest, split
rows = manifest.read(Path('tests/reference/manifest.csv'))
halves = split.split(rows)
for name, half in halves.items():
    print(name, len(half), sum(r.label == 'SINGLE_BIRD' for r in half), sum(r.label in manifest.DISCARD_LABELS for r in half))
print(split.check_minimum(halves[split.MEASUREMENT]) or 'ok')
"
```

Expected: `ok`. Se não der:
- aumentar os números em `src/photo_curator/reference/sources.py`, nas fontes do que falta: `SPECIES_OBSERVATIONS` para `SINGLE_BIRD`, e as observações dos `HARD_SOURCES` para descarte;
- rodar o Step 1 (só o `build_reference.py`) de novo;
- republicar a página (Step 2) e pedir ao dono que revise só as novas (filtro "Não revisadas");
- repetir os Steps 4 e 5.

A mudança no `sources.py` entra neste mesmo PR.

- [ ] **Step 6: Commit do conjunto**

```bash
git add tests/reference src/photo_curator/reference/sources.py && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: conjunto de referência revisado pelo dono" -m "<N fotos; medição com X SINGLE_BIRD e Y descartes>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
```

### Task 8: Calibrar, medir e pôr o job `reference` na CI

**Files:**
- Modify: `src/photo_curator/config.py` (limites calibrados e, se mudarem, `MODEL_VERSION`)
- Modify: `.github/workflows/ci.yml` (job `reference`)
- Modify: `README.md` (seção do conjunto de referência)

**Interfaces:**
- Consumes: `scripts/calibrate.py` e `scripts/measure.py` (Task 6), o conjunto da Task 7.
- Produces: `config.py` calibrado e o job `reference`, que reprova abaixo das metas.

- [ ] **Step 1: Calibrar**

```bash
mkdir -p .cache && CURATOR_MODELS_DIR=models uv run python scripts/calibrate.py | tee .cache/calibrate.txt
```

Expected: dois relatórios (antes e depois) e o trecho para o `config.py`.

- [ ] **Step 2: Aplicar os limites**

Substituir no `config.py` os valores de `DISCARD_MIN`, `FLOCK_MIN`, `NO_BIRD_MIN`, `NO_BIRD_STRONG`, `WEAK_DETECTION` e `DOMINANCE` pelos do trecho, mantendo os comentários de cada um.

Acrescentar acima de `DISCARD_MIN` um comentário com a data, a semente e o resultado na calibração (as três metas).

Se algum valor mudou, trocar `MODEL_VERSION` para `"rtdetr-r50vd+openclip-b32@2"`: a regra mudou, e o worker usa a versão para saber o que refazer.

Run: `uv run pytest -q && CURATOR_MODELS_DIR=models uv run pytest -m models -q`
Expected: tudo passa. Se as fotos reais do A1 (andorinha, anu, arara) mudarem de categoria com os limites novos, **não** forçar o teste: anotar no ledger e levar ao dono, porque é sinal de que a calibração exagerou.

- [ ] **Step 3: Medir (uma vez)**

```bash
CURATOR_MODELS_DIR=models uv run python scripts/measure.py | tee .cache/measure.txt
```

Expected: o resumo com as três metas, o intervalo de Wilson, a acurácia e a matriz, e a saída 0.

**PONTO DE PARADA:** se sair 1 (meta abaixo do mínimo), **parar**:
- não mexer em limite depois de olhar a medição;
- levar ao dono os números da calibração e da medição e a matriz de confusão;
- dizer qual erro domina (ex.: ovo visto como ave sozinha);
- apresentar as opções da spec: plano B com uma camada linear treinada sobre o CLIP, troca do detector, ou ajuste das frases com sorteio novo (semente trocada e registrada).

- [ ] **Step 4: Job `reference` na CI**

Em `.github/workflows/ci.yml`, acrescentar ao cabeçalho `# - reference: mede o curador no conjunto de referência e reprova abaixo das metas;` e, depois do job `models`:

```yaml
  # Mede o curador na metade de medição do conjunto de referência e reprova
  # abaixo das metas da spec (precisão de SINGLE_BIRD >= 95%, revocação de
  # SINGLE_BIRD >= 70%, revocação dos descartes >= 90%). O resumo, com o
  # intervalo de Wilson e a matriz de confusão, aparece na página do job.
  reference:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: astral-sh/setup-uv@v10.3.0
        with:
          version: "0.13.1"
          enable-cache: true
      - run: uv sync --frozen
      - uses: actions/cache@v4
        with:
          path: models
          key: weights-${{ hashFiles('src/photo_curator/weights.py') }}
      - run: uv run python -m photo_curator.weights models
      - run: uv run python scripts/measure.py
        env:
          CURATOR_MODELS_DIR: models
```

- [ ] **Step 5: README**

Acrescentar ao `README.md`, antes de "As fotos de `tests/fixtures`...":

````markdown
## Conjunto de referência

Em `tests/reference/`: fotos reais do iNaturalist, revisadas à mão, que medem se a regra acerta.

- `manifest.csv`: uma linha por foto, com a sugestão (`proposed_label`) e o rótulo revisado (`label`).
- `photos/`: as fotos, com 512 px no lado maior. Cada uma mantém a licença CC dela; ver `tests/reference/ATTRIBUTION.md`.
- Divisão fixa (semente em `src/photo_curator/reference/split.py`): os limites do `config.py` saem da metade de calibração, e a CI mede na metade de medição.

```bash
uv run python scripts/build_reference.py        # baixa ou cresce o conjunto
uv run python scripts/make_review_page.py       # monta a página de revisão em build/review
uv run python scripts/apply_review.py           # aplica tests/reference/review.json
CURATOR_MODELS_DIR=models uv run python scripts/calibrate.py   # sugere limites (metade de calibração)
CURATOR_MODELS_DIR=models uv run python scripts/measure.py     # mede (metade de medição)
```

Mudar um limite depois de olhar a medição pede um sorteio novo: troque `SEED` e registre o motivo no commit.
````

- [ ] **Step 6: Commit, PR 5b e CI**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: limites calibrados e job de referência na CI" -m "<resultado da calibração e da medição: as três metas com o IC de Wilson>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
git push -u origin feat/conjunto-de-referencia
gh pr create --base main --title "feat: conjunto de referência, calibração e metas na CI" --body "<resumo com os números da medição; PR 5b da frente A>"
```

Expected: a CI fica verde, com o job `reference` publicando o resumo.

---

## Depois deste plano

- **Plano A3:** catalog (migração 0004, cliente do iNaturalist com até 3 fotos por observação, ingestão com o curador, `requeue` e `curation-report`), compose (`photo-curator` na rede `passarim-curation`, com `MODELS_DIR`) e a reingestão das 41 espécies (PRs 6 a 10 da spec).
</content>
</invoke>
