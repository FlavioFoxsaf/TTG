-- NotaTTG: esquema do banco (PostgreSQL / Supabase)
-- Hierarquia: ciclo (semestre + modalidade + fase) -> equipe -> estudante -> avaliacao
-- Este arquivo é idempotente: pode ser executado várias vezes (o PGlite o executa a cada início).

-- Perfis (reunião de 19/11):
--   coordenacao: acompanha o andamento, resultados e histórico
--   gestao:      orientador de gestão de projetos — importa alunos, monta equipes, configura o ciclo,
--                avalia pelo olhar de gestão e lança a nota do cliente
--   execucao:    orientador de execução técnica — avalia pelo olhar técnico
--   estudante
create table if not exists usuario (
  id         serial primary key,
  nome       text not null,
  email      text not null unique,
  matricula  text,
  perfil     text not null,
  senha_hash text not null,
  criado_em  timestamptz not null default now()
);

-- Processo avaliativo (RF04, RN07, RN08)
create table if not exists ciclo (
  id                    serial primary key,
  semestre              text not null,
  modalidade            text not null,
  fase                  int  not null,
  -- janela dos orientadores
  janela_inicio         date not null,
  janela_fim            date not null,
  -- pesos das quatro fontes do conceito individual (RN02)
  peso_orient_gestao    numeric not null default 25,
  peso_orient_execucao  numeric not null default 25,
  peso_auto             numeric not null default 25,
  peso_colegas          numeric not null default 25,
  ativo                 boolean not null default false,
  unique (semestre, modalidade, fase)
);

-- tipo 'equipe': componentes da nota da equipe (RN01)
-- tipo 'individual': critérios do conceito individual, avaliados na escala de conceitos
-- fonte: quem avalia o critério
--   orientador = os dois orientadores | gestao | execucao | estudante | cliente (lançada pelo orientador de gestão)
--   nulo (legado) = todos
create table if not exists criterio (
  id       serial primary key,
  ciclo_id int  not null references ciclo(id) on delete cascade,
  tipo     text not null check (tipo in ('equipe', 'individual')),
  nome     text not null,
  peso     numeric not null,
  fonte    text,
  ordem    int  not null default 0
);

create table if not exists escala (
  id       serial primary key,
  ciclo_id int     not null references ciclo(id) on delete cascade,
  rotulo   text    not null,
  valor    numeric not null
);

-- RF02
create table if not exists equipe (
  id                 serial primary key,
  ciclo_id           int  not null references ciclo(id) on delete cascade,
  nome               text not null,
  lider_id           int  references usuario(id),
  orient_gestao_id   int  references usuario(id),
  orient_execucao_id int  references usuario(id)
);

-- Cada estudante pertence a uma única equipe no ciclo (HU02)
create table if not exists membro (
  ciclo_id     int not null references ciclo(id) on delete cascade,
  equipe_id    int not null references equipe(id) on delete cascade,
  estudante_id int not null references usuario(id),
  primary key (ciclo_id, estudante_id)
);

-- Avaliações brutas, preservadas (RNF03)
-- papel: orient_gestao | orient_execucao | auto | colega | projeto | cliente
-- avaliado_id nulo = avaliação da equipe
create table if not exists avaliacao (
  id            serial primary key,
  ciclo_id      int     not null references ciclo(id) on delete cascade,
  equipe_id     int     not null references equipe(id) on delete cascade,
  avaliador_id  int     not null references usuario(id),
  papel         text    not null,
  avaliado_id   int     references usuario(id),
  criterio_id   int     not null references criterio(id) on delete cascade,
  valor         numeric not null,
  atualizado_em timestamptz not null default now(),
  unique nulls not distinct (avaliador_id, equipe_id, avaliado_id, criterio_id)
);

-- Resultado calculado, com memória de cálculo (RF06, RF09, RNF03)
create table if not exists resultado (
  ciclo_id     int     not null references ciclo(id) on delete cascade,
  estudante_id int     not null references usuario(id),
  equipe_id    int     not null references equipe(id) on delete cascade,
  nota_equipe  numeric not null,
  conceito     numeric not null,
  cdi          numeric not null,
  nota_final   numeric not null,
  memoria      jsonb   not null,
  calculado_em timestamptz not null default now(),
  primary key (ciclo_id, estudante_id)
);

create table if not exists auditoria (
  id         serial primary key,
  usuario_id int references usuario(id),
  acao       text not null,
  detalhe    text,
  em         timestamptz not null default now()
);

-- Comentários livres sobre o trabalho em equipe (formulário 360º do professor)
create table if not exists comentario (
  ciclo_id      int  not null references ciclo(id) on delete cascade,
  equipe_id     int  not null references equipe(id) on delete cascade,
  avaliador_id  int  not null references usuario(id),
  texto         text not null,
  atualizado_em timestamptz not null default now(),
  primary key (equipe_id, avaliador_id)
);

-- ---------------------------------------------------------------------------
-- Migração 2026-11-22 (ajustes da reunião de 19/11). Segura para rodar de novo.
-- ---------------------------------------------------------------------------

-- Cliente do projeto (só informação, não faz login)
alter table equipe add column if not exists cliente text;

-- Janelas do estudante: ele só avalia e só vê a nota quando a gestão libera.
-- Datas vazias = fechado.
alter table ciclo add column if not exists auto_inicio      date; -- projeto e autoavaliação
alter table ciclo add column if not exists auto_fim         date;
alter table ciclo add column if not exists colegas_inicio   date; -- avaliação dos colegas
alter table ciclo add column if not exists colegas_fim      date;
alter table ciclo add column if not exists nota_liberada_em date; -- a partir desta data o estudante vê a nota

-- Perfil "orientador" único vira dois perfis, pelo papel que a pessoa já ocupa nas equipes
alter table usuario drop constraint if exists usuario_perfil_check;
update usuario set perfil = 'gestao'
  where perfil = 'orientador' and id in (select orient_gestao_id from equipe where orient_gestao_id is not null);
update usuario set perfil = 'execucao' where perfil = 'orientador';
alter table usuario add constraint usuario_perfil_check
  check (perfil in ('coordenacao', 'gestao', 'execucao', 'estudante'));

alter table criterio drop constraint if exists criterio_fonte_check;
alter table criterio add constraint criterio_fonte_check
  check (fonte in ('orientador', 'gestao', 'execucao', 'estudante', 'cliente'));

-- ---------------------------------------------------------------------------
-- Migração 2026-11-24 (formulário "Avaliação 360º - Equipe" do professor). Segura para rodar de novo.
-- ---------------------------------------------------------------------------

-- Texto completo da pergunta. descricao: como aparece para orientadores e na avaliação cruzada;
-- descricao_auto: versão em primeira pessoa usada na autoavaliação (vazia = usa descricao)
alter table criterio add column if not exists descricao      text;
alter table criterio add column if not exists descricao_auto text;

-- Curso do estudante (o formulário pede; útil para análises da coordenação)
alter table usuario add column if not exists curso text;

-- Vários comentários por avaliador: projeto | auto | geral | colegas:<criterio_id>
alter table comentario add column if not exists tipo text not null default 'projeto';
alter table comentario drop constraint if exists comentario_pkey;
alter table comentario add constraint comentario_pkey primary key (equipe_id, avaliador_id, tipo);

-- Frases das pontas da escala (ex.: "Muito baixo. Decepcionante." / "Muito alto! Excelente experiência!").
-- Aparecem na avaliação do projeto e na autoavaliação, como no formulário do professor.
alter table criterio add column if not exists ancora_min text;
alter table criterio add column if not exists ancora_max text;
