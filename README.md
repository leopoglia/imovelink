# Imovelink

Aplicação para gestão de imóveis, busca em linguagem natural e vitrine pública por imobiliária.

Projeto de portfólio de Leonardo Heitor Poglia — Engenharia de Software, Católica SC.

## Funcionalidades

- Cadastro de imóveis, alteração de preço/status e auditoria.
- Busca por descrição, com interpretação via Google Gemini quando configurado e regras locais como alternativa.
- Vitrine pública com captação de contatos e recomendações do catálogo.
- Configurações de perfil e imobiliária.
- Login com senha, sessão no servidor e acessos recentes autorizados.

O projeto não inclui painel de Leads/Kanban, assinaturas ou pagamentos.

## Tecnologias em uso

Next.js 15 (interface e APIs), React 19, TypeScript, Tailwind CSS 4, TanStack Query, Zustand, Zod, Iconoir e componentes Radix para os menus e selects. A fonte Fustat é hospedada localmente, com licença em `src/app/fonts/OFL.txt`.

O backend pertence ao Next.js. Com `DATABASE_URL`, os repositórios usam PostgreSQL, inclusive quando hospedado no Supabase; autenticação, APIs e regras continuam no projeto. Sem essa variável, o catálogo local utiliza `data/database.json`; a autenticação exige PostgreSQL e não libera acesso demonstrativo.

## Executar

Requer Node.js 22 e npm.

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000`. A vitrine demonstrativa fica em `/vitrine/catolica-prime-imoveis`.

Para ativar a interpretação por IA, preencha `GEMINI_API_KEY` em `.env.local` com uma chave do Google AI Studio e reinicie o servidor. `GEMINI_MODEL` permite escolher o modelo; o padrão é `gemini-3.5-flash-lite`. Execute `npm run ai:check` para verificar a chave, o modelo e uma resposta estruturada real. Sem chave, a interface identifica a busca local. A chave não deve ser exposta em variáveis `NEXT_PUBLIC_`.

Para configurar PostgreSQL, preencha `DATABASE_URL` e execute `npm run db:check`, `npm run db:migrate` e `npm run db:import`. A importação inicial exige destino vazio e preserva o arquivo local.

Para definir a senha de uma conta existente, execute `npm run auth:set-password` no terminal. A senha não é exibida nem recebida como argumento.

## Verificar

```bash
npm run typecheck
npm test
npm run build
```

Os testes de persistência utilizam dados em memória e não devem alterar o banco de desenvolvimento. Pare o servidor de desenvolvimento antes de gerar uma build: ambos os processos usam `.next` por padrão.

## Estrutura

```text
src/app/                  Páginas e APIs do Next.js
src/components/           Interface reutilizável
src/server/services/      Regras de negócio e integração de IA
src/server/repositories/  Acesso ao armazenamento
src/server/seeds/         Dados de demonstração
src/types/                Tipos do domínio
src/__tests__/            Testes automatizados
```

## Pendências para produção e portfólio

As páginas internas e APIs privadas validam sessões no servidor e derivam identidade, imobiliária e permissões do usuário autenticado. Cada ambiente precisa de sua conexão, certificado e configuração de origem pública. Ainda faltam comprovação de cobertura, deploy automatizado, análise de segurança e monitoramento. Recuperação de senha e convites não foram implementados; contas existentes são administradas pelo comando local.

A integração de IA deve ser validada com uma credencial real. Esta versão não gera embeddings nem executa consultas pgvector/PostGIS.
