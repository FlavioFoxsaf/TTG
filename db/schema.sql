-- NotaTTG: esquema do banco (PostgreSQL / Supabase)
-- Hierarquia: ciclo (semestre + modalidade + fase) -> equipe -> estudante -> avaliacao

create table if not exists usuario (
  id         serial primary key,
  nome       text not null,
  email      text not null unique,
  matricula  text,
  perfil     text not null check (perfil in ('coordenacao', 'orientador', 'estudante')),
  senha_hash text not null,
  criado_em  timestamptz not null default now()
);

-- Processo avaliativo (RF04, RN07, RN08)
create table if not exists ciclo (
  id                    serial primary key,
  semestre              text not null,
  modalidade            text not null,
  fase                  int  not null,
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

-- tipo 'equipe': componentes da nota da equipe (RN01), nota de 0 a 10
-- tipo 'individual': critérios do conceito individual, avaliados na escala de conceitos
-- fonte: quem avalia o componente de equipe ('orientador' ou 'estudante')
create table if not exists criterio (
  id       serial primary key,
  ciclo_id int  not null references ciclo(id) on delete cascade,
  tipo     text not null check (tipo in ('equipe', 'individual')),
  nome     text not null,
  peso     numeric not null,
  fonte    text check (fonte in ('orientador', 'estudante')),
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
-- papel: orient_gestao | orient_execucao | auto | colega | projeto
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
