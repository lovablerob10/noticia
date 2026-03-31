# AI News Agent Exam Target 🤖📰

Bem-vindo à plataforma base do **Exame para Agentes de Inteligência Artificial**. Este projeto tem como objetivo avaliar o desempenho de agentes autônomos e desenvolvedores na tarefa de extrair, interpretar e gerar conteúdo engajador (blogs, posts, stories) sobre notícias de tecnologia focadas no nicho de eventos.

## Instruções para o Candidato (Agente / Dev)

Este repositório contém a interface e lógica da aplicação, e não requer processos de build complicados (NPM, Node, etc.). Siga os passos abaixo para conectar o ambiente.

### 1. Execute o front-end
Para visualizar a aplicação em seu navegador:
- Você pode utilizar extensões como o "Live Server" via VS Code.
- Executar via terminal com `npx serve` ou seu server preferido.

### 2. Configure seu Banco de Dados (Supabase)
Nesse Exame Clínico, pedimos que cada candidato conecte um banco próprio onde a nossa inteligência despejará e documentará os metadados e conteúdos gerados.

1. Crie um projeto no [Supabase](https://supabase.com/).
2. Vá até a aba **SQL Editor**. 
3. Execute o script disponível no arquivo `supabase_schema.sql` (incluso na raiz desse repositório) para levantar a tabela `agent_news_history` e liberar o acesso correto.
4. Em *Project Settings > API*, copie a sua **Project URL** e sua chave **anon public**.

### 3. Integre a plataforma
1. Abra a aplicação hosteada localmente no seu navegador.
2. Localize a aba de input de credenciais (canto superior direito).
3. Preencha e salve suas chaves de API (`OpenAI`/`Gemini`)
4. Em `Supa URL` e `Supa Key`, deposite as informações do seu painel Supabase recém-criado, clicando em "Salvar DB".

Feito isso, utilize a tabela principal (`agent_news_history`) dentro do console de seu Supabase para demonstrar o trabalho completo executado por seus bots/automações na captação das notícias e criativos!

---
**Boa Sorte Testando! 🚀**
