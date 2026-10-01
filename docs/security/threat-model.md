# Modelo de ameaças — Passarim (MVP)

Método: **STRIDE** — para cada parte do sistema perguntamos se alguém pode
**S**e passar por outro (Spoofing), **A**dulterar dados (Tampering),
**N**egar o que fez (Repudiation), **V**azar informação (Information disclosure),
**D**errubar o serviço (Denial of service) ou **G**anhar privilégio (Elevation).

## O que protegemos

1. Disponibilidade do BFF (plano gratuito tem pouca capacidade).
2. Integridade do catálogo (ninguém de fora altera aves, fotos ou créditos).
3. Segredos (chave do xeno-canto, credenciais do banco e do storage).
4. Privacidade do usuário (o MVP não coleta dados pessoais; IP aparece só em logs).

## Fronteiras de confiança

Internet → Traefik → BFF → (rede privada) → Catalog → PostgreSQL / Storage.
Worker → Internet (APIs externas): **tudo que volta é não confiável**.

## Ameaças e mitigações

| Componente | STRIDE | Ameaça | Mitigação | OWASP |
|---|---|---|---|---|
| BFF | D | Inundação de requisições | Rate limit por IP, limites de página/busca, timeouts HTTP | API4 |
| BFF | I | Vazar stack trace ou campos internos | problem+json sem detalhes; DTOs explícitos | API3, API8 |
| BFF | T | Injeção via parâmetros de busca | Validação de entrada; queries parametrizadas no catalog | Injeção |
| Catalog | S | Alguém além do BFF chamar o gRPC | Rede privada + mTLS | API2, API5 |
| Catalog | E | Acesso a operações administrativas | Admin não exposto publicamente; chave de admin | API5 |
| Worker | T/E | SSRF: URL externa apontando para rede interna | Allowlist de hosts, bloqueio de IP privado/link-local | API7 |
| Worker | D | Imagem "bomba de descompressão" | Limite de pixels e de bytes por download | API10 |
| Worker | T | HTML malicioso vindo da Wikipedia | Sanitização para texto puro | API10 |
| Worker | D | Ser bloqueado pelas fontes | Rate limit por fonte, backoff | API10 |
| Repositórios | I | Segredo commitado | `.gitignore`, gitleaks no CI | Falhas de segredo |
| Dependências | T | Biblioteca vulnerável | govulncheck, Trivy, Dependabot; build falha em alta/crítica | Componentes vulneráveis |
| App | I | Tráfego interceptado | HTTPS obrigatório, cleartext bloqueado | MASVS-NETWORK |
| App | I | Segredo extraído do APK | Nenhum segredo no app | MASVS-STORAGE |

## Repúdio (R)

Sem contas de usuário no MVP, não há ação a repudiar. Logs estruturados com
`request_id` permitem rastrear qualquer requisição de ponta a ponta.

## Riscos aceitos

- Sem certificate pinning ([ADR-0008](../adr/0008-sem-certificate-pinning.md)).
- Sem atestação de app: qualquer cliente HTTP pode chamar o BFF (mitigado por rate limit). Revisar na v2.

## Métricas de segurança

429 por minuto · taxa de 4xx/5xx · rejeições mTLS · downloads bloqueados pela allowlist · vulnerabilidades por severidade por build.
