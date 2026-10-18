#!/usr/bin/env bash
# shellcheck disable=SC2034
# (A linha acima vale para o arquivo todo: as variáveis daqui são usadas pelos
# scripts que carregam este arquivo, não por ele, e o shellcheck, o verificador
# de scripts, as acusaria de "não usadas".)
#
# lib.sh — funções comuns a todos os scripts de env.scripts.
#
# Papel na arquitetura: env.scripts é a "interface operacional" do Passarim.
# Em vez de cada pessoa (ou agente de IA) descobrir em que pasta rodar o
# docker compose, que portas olhar e em que ordem subir back-end e app, os
# scripts guardam o jeito certo de operar o ambiente em comandos com nome de
# intenção (init-all, status, down-all...). Este arquivo não roda sozinho:
# os outros scripts o carregam com "source", que executa o arquivo dentro do
# próprio script, como se o texto estivesse colado lá.
#
# Depende de: Docker Desktop (back-end), Android SDK e JDK 21 (app Android),
# Xcode e XcodeGen (app iOS). Os repositórios ficam lado a lado na mesma pasta
# (passarim-docs, passarim-app, passarim-bff, passarim-catalog...).

# "set -euo pipefail": o script PARA no primeiro comando que falhar (-e), usar
# uma variável que não existe é erro (-u) e, num "a | b", a falha de "a" não
# fica escondida pelo sucesso de "b" (pipefail). Sem isso, um passo quebrado
# no meio passaria em silêncio e o script diria "pronto" com o ambiente torto.
set -euo pipefail

# Caminhos absolutos a partir de onde este arquivo está, para os scripts
# funcionarem chamados de qualquer pasta. BASH_SOURCE[0] é o caminho do
# arquivo que está sendo lido (este lib.sh), não o do script que o carregou.
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPTS_DIR")"
ROOT_DIR="$(dirname "$DOCS_DIR")"
APP_DIR="$ROOT_DIR/passarim-app"

# Identificador do app nos dois sistemas (applicationId no Android,
# PRODUCT_BUNDLE_IDENTIFIER no iOS): é por ele que abrimos e fechamos o app.
APP_ID="com.velosobr.passarim"

# Ferramentas do Android SDK. ANDROID_HOME, se definido, ganha do caminho padrão
# do Android Studio no macOS. A sintaxe ${VAR:-padrão} usa o padrão quando a
# variável está vazia ou não existe.
ANDROID_SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$ANDROID_SDK/platform-tools/adb"
EMULATOR="$ANDROID_SDK/emulator/emulator"

# Pasta dos logs (do compose, do emulador). O TMPDIR do macOS termina em "/";
# o "%/" tira essa barra final para o caminho não sair com "//".
LOG_DIR="${TMPDIR:-/tmp}"
LOG_DIR="${LOG_DIR%/}"

# Saída curta e padronizada: quem lê (gente ou IA) acha o essencial sem rolar
# páginas de log. Erros vão para a saída de erro (>&2) e encerram o script.
step() { printf '→ %s\n' "$*"; }
ok() { printf '✓ %s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
fail() {
  printf 'erro: %s\n' "$*" >&2
  exit 1
}

# Mostra o comentário do topo do script que chamou (as linhas que começam com
# "# " logo depois do #!) quando a pessoa passa -h ou --help. Assim a ajuda e
# a documentação do script são o mesmo texto e não ficam desatualizadas.
help_if_asked() {
  case "${1:-}" in
    -h | --help)
      sed -n '2,/^[^#]/p' "$0" | sed -e '/^[^#]/d' -e 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
}

# docker compose sempre a partir do passarim-docs, onde moram o
# docker-compose.yml e o .env. Os parênteses rodam o "cd" num subshell (uma
# cópia do shell): a pasta atual de quem chamou não muda.
compose() { (cd "$DOCS_DIR" && docker compose "$@"); }

# Lê um valor do .env (ex.: env_value HOST_PORT_TRAEFIK_HTTP). Nunca imprime o
# arquivo inteiro: ele tem senhas. "|| true" evita que o set -e derrube o
# script quando a chave não existe (o grep sai com 1 se não achar nada).
env_value() {
  { grep -E "^$1=" "$DOCS_DIR/.env" 2>/dev/null || true; } | tail -n 1 | cut -d= -f2-
}

# Porta do Traefik (a porta de entrada do BFF) no seu computador.
bff_port() {
  local port
  port="$(env_value HOST_PORT_TRAEFIK_HTTP)"
  printf '%s' "${port:-8080}"
}

# Cria o .env a partir do .env.example na primeira vez e confere a única
# variável que não tem valor padrão: a chave do xeno-canto, que o worker de
# ingestão exige. O valor nunca é impresso, só a presença dele.
ensure_env() {
  if [ ! -f "$DOCS_DIR/.env" ]; then
    cp "$DOCS_DIR/.env.example" "$DOCS_DIR/.env"
    ok ".env criado a partir do .env.example"
  fi
  if [ -z "$(env_value XENO_CANTO_API_KEY)" ]; then
    fail "preencha XENO_CANTO_API_KEY em $DOCS_DIR/.env (conta gratuita em https://xeno-canto.org)"
  fi
}

# A primeira linha da entrada. Por que não "head -n 1": o head fecha o cano
# assim que lê a linha, e o comando da esquerda, se ainda estiver escrevendo
# (xcrun simctl list escreve muito), morre com SIGPIPE; com o pipefail, isso
# derruba o script (saída 141). O awk lê tudo e só imprime a primeira.
first_line() { awk 'NR == 1 { line = $0 } END { print line }'; }

# Quantos daemons do Gradle do app estão rodando. Um daemon é um processo
# Java que o Gradle deixa vivo depois do build para o próximo ser mais rápido,
# e costuma segurar 1 a 2 GB de RAM. Contamos só os da versão do Gradle do app
# (lida do gradle-wrapper.properties): daemons de outros projetos da máquina
# não são do Passarim, e o "./gradlew --stop" daqui nem os alcança.
app_gradle_daemons() {
  local version
  version="$(sed -nE 's/.*gradle-([0-9.]+)-(bin|all)\.zip.*/\1/p' \
    "$APP_DIR/gradle/wrapper/gradle-wrapper.properties" 2>/dev/null)"
  [ -n "$version" ] || { echo 0; return 0; }
  # "|| true": sem nenhum daemon o pgrep sai com 1, e o pipefail pararia o script.
  { pgrep -f "gradle-daemon-main-$version" || true; } | wc -l | tr -d ' '
}

docker_ready() { docker info >/dev/null 2>&1; }

# Abre o Docker Desktop se o daemon (o processo que de fato roda os
# containers) estiver parado, e espera até 2 minutos ele responder.
ensure_docker() {
  docker_ready && return 0
  step "abrindo o Docker Desktop"
  open -a Docker || fail "não achei o Docker Desktop; instale ou abra-o à mão"
  for _ in $(seq 1 60); do
    docker_ready && {
      ok "Docker no ar"
      return 0
    }
    sleep 2
  done
  fail "o Docker não respondeu em 2 minutos"
}

# Código HTTP de uma URL ("000" quando nada responde). Timeout curto: o status
# precisa ser rápido, e um serviço que leva mais de 3 s para responder a uma
# lista de filtros já não está "pronto".
http_code() {
  curl -s -o /dev/null -m 3 -w '%{http_code}' "$1" 2>/dev/null || true
}

# Aparelhos Android conectados e prontos (emulador ou físico), um serial por
# linha. "adb devices" lista também os "offline" e "unauthorized": só o
# estado "device" aceita instalar app.
android_devices() {
  [ -x "$ADB" ] || return 0
  "$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1 }'
}

# Simuladores iOS ligados (estado "Booted"), um UDID por linha. O UDID é o
# identificador único de cada simulador.
booted_simulators() {
  command -v xcrun >/dev/null || return 0
  xcrun simctl list devices booted 2>/dev/null | sed -nE 's/.*\(([0-9A-F-]{36})\) \(Booted\).*/\1/p'
}
