# 🏢 Imovelink: Gestão de Imóveis e Prospecção Inteligente de Leads

![Status](https://img.shields.io/badge/Status-Em_Desenvolvimento-orange)
![Next.js](https://img.shields.io/badge/Next.js-15+-black?logo=next.js)
![Laravel](https://img.shields.io/badge/Laravel-11-FF2D20?logo=laravel)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-PostGIS_%7C_pgvector-336791?logo=postgresql)
![AI](https://img.shields.io/badge/AI-DeepSeek_%7C_OpenAI-000000?logo=openai)

> **Projeto de Portfólio (N3)** - Engenharia de Software | Católica SC (Jaraguá do Sul)
> **Autor:** Leonardo Heitor Poglia

---

## 🎥 Pitch de Apresentação
Assista ao vídeo de apresentação do projeto, abordando o contexto, a solução proposta, a inovação e a necessidade do mercado:

👉 **[Insira o link do seu vídeo Não Listado/Público do YouTube aqui]**

---

## 📖 Sobre o Projeto

O mercado imobiliário exige agilidade e precisão, mas corretores frequentemente perdem produtividade gerenciando informações fragmentadas em sistemas densos, resultando no esfriamento de *leads* e perda de vendas. 

O **Imovelink** é uma aplicação Web (SaaS) construída sob medida para sanar esses gargalos operacionais. Ele atua como um assistente ativo para o corretor de ponta, centralizando o portfólio, otimizando buscas espaciais e qualificando leads através de Inteligência Artificial.

### 🎯 O Problema
Sistemas de mercado (CRMs tradicionais) concentram esforços em módulos administrativos complexos (ERP, faturamento, contratos), tornando a experiência de captação e prospecção lenta e engessada para o corretor.

### 💡 A Solução
O Imovelink foca exclusivamente na **atividade fim de vendas**. A plataforma unifica a gestão de imóveis e oferece um CRM ágil em formato Kanban, integrado com IA para ler o desejo do cliente de forma semântica (ex: *"casa com quintal perto do centro"*) e automatizar a qualificação da oportunidade.

---

## 🚀 Principais Funcionalidades e Inovação

*   **Motor de Busca Semântico e Espacial:** Utiliza *Large Language Models* (LLMs) via *Structured Outputs* para interpretar solicitações naturais, cruzando dados com **PostGIS** (geocodificação) e **pgvector** (busca híbrida por *embeddings*).
*   **Gestão de Leads (Kanban CRM):** Interface fluida para acompanhamento de clientes. Conta com indicadores automatizados de inatividade e distribuição inteligente de oportunidades.
*   **Gerador B2B de Sites (White-label):** Módulo que permite a pequenas imobiliárias gerarem seus próprios sites otimizados para SEO, com *Server-Side Rendering* (SSR) e microdados *Schema.org*.
*   **Integração Bancária Nativa:** Módulo de cobrança recorrente automatizado através da API do **Asaas** via webhooks.
*   **Auditoria de Imóveis:** Mecanismo leve de controle de qualidade para garantir a integridade e atualização das informações do portfólio.

---

## 🛠️ Arquitetura e Tecnologias

A arquitetura do sistema segue o modelo **Service-Repository Pattern**, isolando regras de negócio e garantindo escalabilidade para o formato Multi-Tenant.

### Backend (API RESTful)
*   **Framework:** Laravel 11 (PHP 8.2+)
*   **Banco de Dados:** PostgreSQL
*   **Extensões de BD:** PostGIS (Cálculo Espacial) e pgvector (Busca Vetorial)
*   **Autenticação e Segurança:** Laravel Sanctum (SPA Auth) e Spatie (RBAC)

### Frontend (Painel e Sites B2B)
*   **Framework:** Next.js 15+ (App Router) e React 19
*   **Linguagem:** TypeScript
*   **Estilização e UI:** Tailwind CSS + Shadcn/UI
*   **Gerenciamento de Estado:** TanStack Query e Zustand

### Integrações
*   **Inteligência Artificial:** LLMs (DeepSeek / OpenAI)
*   **Pagamentos:** Asaas API

---

## ⚙️ Como Executar o Projeto (Ambiente de Desenvolvimento)

### Pré-requisitos
*   Docker e Docker Compose (Laravel Sail)
*   Node.js (v20+) e npm/yarn
*   Chaves de API configuradas (`.env`) para Asaas e Provedores de IA

### Backend (Laravel)
```bash
# Clone o repositório
git clone [https://github.com/seu-usuario/ia-imob.git](https://github.com/seu-usuario/ia-imob.git)
cd ia-imob/ai-backendd-imobiliaria

# Instale as dependências
composer install

# Configure o ambiente
cp .env.example .env
php artisan key:generate

# Inicie os containers (Sail) e rode as migrations
./vendor/bin/sail up -d
./vendor/bin/sail artisan migrate --seed
