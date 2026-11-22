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

| Perfil | E-mail | Senha |
|---|---|---|
| Coordenação | coordenacao@cimatec.br | coord123 |
| Orientador | orientador1@cimatec.br | O001 |
| Estudante | estudante.k@cimatec.br | 2026110 |

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
app/coordenacao/     telas e ações da coordenação (RF01, 02, 04, 06, 08, 09, 10)
app/orientador/      avaliação das equipes orientadas
app/estudante/       projeto, autoavaliação, colegas e minha nota (RF07)
components/          cabeçalho, abas, avisos e formulário de avaliação
```

## Fluxo (diagrama C2)

1. Coordenação importa usuários (CSV `nome,email,matricula[,perfil]`), monta equipes e configura o ciclo.
2. Orientadores e estudantes registram avaliações dentro da janela.
3. **Resultados → Calcular notas**: o motor lê o report de avaliações brutas (o mesmo do botão *Report CSV*),
   aplica os pesos e grava as notas com a memória de cálculo.
4. **Exportar notas** gera o XLSX: aba *Notas finais* (uma linha por estudante) e aba *Memória de cálculo*.

## Regras de cálculo

- **Nota da equipe** = média ponderada dos componentes de equipe (notas de 0 a 10; cada componente é a média de quem o avaliou).
- **Conceito individual** = média ponderada de quatro fontes: orientador de gestão, orientador de execução, autoavaliação e média dos colegas.
- **CDI** = conceito ÷ maior conceito da equipe. **Nota final** = nota da equipe × CDI.
- Item sem avaliação é ignorado e os pesos restantes são redistribuídos (fica visível na memória de cálculo).
- Valores guardados com precisão total; arredondamento para 2 casas só na exibição e exportação.

## Pendências a validar com a coordenação

- Nomes e pesos reais dos seis componentes, pesos das quatro fontes e valores da escala de conceitos
  (o seed usa valores de exemplo; tudo é editável em **Configuração**).
- Regra para avaliação ausente e para arredondamento: conferir contra a planilha histórica (RNF02)
  adicionando casos reais em `tests/calculo.test.ts`.
- Login com Google (previsto na stack) no lugar de e-mail e senha.
- Hospedagem do piloto.
