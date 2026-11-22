# NotaTTG

Plataforma de avaliação e apuração de notas da Trilha Técnico-Gestora — SENAI CIMATEC.

## Como rodar

```bash
npm install
npm run seed     # cria dados fictícios de exemplo (só se o banco estiver vazio)
npm run dev      # http://localhost:3000
npm test         # testes do motor de cálculo
```

Sem `DATABASE_URL`, o sistema usa um PostgreSQL embutido (PGlite), sem instalar nada. Os dados ficam em
`~/.notattg-dados` (fora do projeto, porque OneDrive/Google Drive travam os arquivos do banco durante a sincronização).
Outra pasta pode ser escolhida com `PASTA_BANCO_LOCAL` no `.env`.
Para recomeçar do zero, apague essa pasta e rode `npm run seed` de novo.

**Supabase:** rode `db/schema.sql` no SQL Editor do projeto, copie `.env.example` para `.env`,
preencha `DATABASE_URL` (connection string) e `SESSION_SECRET`, e rode `npm run seed` se quiser os dados de exemplo.

Usuários de exemplo:

| Perfil | E-mail | Senha | O que faz |
|---|---|---|---|
| Coordenação | coordenacao@cimatec.br | coord123 | Acompanha o preenchimento, prazos, resultados e histórico |
| Orientador de gestão de projetos | gestao1@cimatec.br | G001 | Configura o ciclo, importa alunos, monta equipes, avalia pelo olhar de gestão e lança a nota do cliente |
| Orientador de execução técnica | execucao1@cimatec.br | E001 | Avalia equipe e integrantes pelo olhar técnico |
| Estudante | estudante.k@cimatec.br | 2026110 | Avalia o projeto, a si mesmo e os colegas; vê a própria nota quando liberada |

Usuários importados entram com a **matrícula como senha**.

## Estrutura

```
db/schema.sql        tabelas (ciclo → equipe → estudante → avaliação, resultado, auditoria)
db/seed.ts           dados fictícios
lib/calculo.ts       motor de cálculo puro (RN01–RN04) — testado em tests/calculo.test.ts
lib/dados.ts         consultas e regras de acesso (RN05–RN07)
lib/auth.ts          sessão e controle por perfil (RF03)
lib/db.ts            conexão: Supabase/PostgreSQL ou PGlite local
app/acoes.ts         login e registro de avaliações (RF05)
app/painel/          gestão (configuração, estudantes, equipes, avaliar) e coordenação (acompanhamento,
                     resultados, histórico) — o menu muda conforme o perfil
app/orientador/      área do orientador de execução técnica
app/estudante/       projeto, autoavaliação, colegas e minha nota (RF07)
components/          cabeçalho, abas, avisos, formulário de avaliação e área do orientador
docs/                transcrição da reunião de 19/11 com o cliente
```

## Fluxo (diagrama C2)

1. Orientador de gestão importa usuários (CSV `nome,email,matricula[,perfil]`, perfil = `estudante`, `gestao` ou `execucao`),
   monta equipes (com o cliente do projeto) e configura o ciclo e os períodos.
2. Orientadores avaliam dentro do período deles; o estudante só avalia quando a gestão libera
   (projeto e autoavaliação, depois colegas). A coordenação acompanha quem falta em **Acompanhamento**.
3. **Resultados → Calcular notas**: o motor lê o report de avaliações brutas (o mesmo do botão *Report CSV*),
   aplica os pesos e grava as notas com a memória de cálculo.
4. **Exportar notas** gera o XLSX com as abas *Notas finais* (para lançar nota a nota), *Por equipe*, *Detalhamento*,
   *Componentes da equipe*, *Memória de cálculo* e *Avaliações (brutas)*.
5. O estudante vê a própria nota (nota da equipe, média dos colegas, CDI e nota final) a partir da data de liberação.

## Regras de cálculo

- **Nota da equipe** = média ponderada dos componentes de equipe (orientadores, perguntas dos estudantes e nota do cliente;
  cada componente é a média de quem o avaliou).
- Cada critério diz **quem avalia**: os dois orientadores, só gestão, só execução, estudantes ou cliente.
- **Escala de conceitos** com 5 níveis (Muito ruim, Ruim, Razoável, Bom, Muito bom), guardados como 2 a 10.
- Os pesos são **bloqueados** se não somarem 100% (componentes da equipe, quatro fontes e critérios de cada avaliador).
- **Conceito individual** = média ponderada de quatro fontes: orientador de gestão, orientador de execução, autoavaliação e média dos colegas.
- **CDI** (Coeficiente de Desempenho Individual) = conceito ÷ maior conceito da equipe. **Nota final** = nota da equipe × CDI.
- Item sem avaliação é ignorado e os pesos restantes são redistribuídos (fica visível na memória de cálculo).
- Valores guardados com precisão total; arredondamento para 2 casas só na exibição e exportação.

## Banco já existente

O banco local é atualizado sozinho ao iniciar (migração no fim de `db/schema.sql`, segura para rodar de novo):
quem era "orientador" vira **gestão** se for orientador de gestão de alguma equipe, senão **execução**;
as avaliações são mantidas e os períodos do estudante começam fechados. No Supabase, rode `db/schema.sql` de novo.
Para ver os novos dados de exemplo, apague `~/.notattg-dados` e rode `npm run seed`.

## Histórico de alterações

O projeto está em git. `git log` lista as versões; para voltar uma alteração, `git revert <commit>`.
O commit "Estado do sistema antes dos ajustes da reunião de 19/11" é a versão apresentada ao professor.

## Pendências a validar com a coordenação

- Perguntas reais dos formulários do professor (avaliação dos colegas, restante da autoavaliação e critérios de
  cada orientador). As 4 perguntas do projeto e as 2 primeiras da autoavaliação já seguem o formulário 360º;
  as demais do seed são provisórias. Tudo é editável em **Configuração**.
- Pesos reais (componentes, nota do cliente, quatro fontes) e valores numéricos da escala.
- Regra para avaliação ausente e para arredondamento: conferir contra a planilha histórica (RNF02)
  adicionando casos reais em `tests/calculo.test.ts`.
- Login com Google acadêmico (aprovado pelo professor na reunião) no lugar de e-mail e senha.
- Módulo de gestão da coordenação: evolução entre ciclos e assistente de IA para apontar problemas (etapas 2 e 3).
- Hospedagem do piloto.
