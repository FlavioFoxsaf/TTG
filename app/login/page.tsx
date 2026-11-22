import { entrar } from '@/app/acoes';
import { Aviso } from '@/components/Aviso';
import { Cabecalho } from '@/components/Cabecalho';

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const busca = await searchParams;
  return (
    <>
      <Cabecalho subtitulo="SENAI CIMATEC · Avaliação da Trilha Técnico-Gestora" />
      <main className="conteudo" style={{ maxWidth: 380 }}>
        <Aviso busca={busca} />
        <form action={entrar} className="cartao">
          <label htmlFor="email">E-mail institucional</label>
          <input id="email" name="email" type="email" required style={{ width: '100%', marginBottom: 14 }} />
          <label htmlFor="senha">Senha</label>
          <input id="senha" name="senha" type="password" required style={{ width: '100%', marginBottom: 18 }} />
          <button className="botao" style={{ width: '100%' }}>Entrar</button>
          <p className="suave" style={{ textAlign: 'center' }}>O sistema identifica seu perfil automaticamente</p>
        </form>
        <p className="suave" style={{ textAlign: 'center' }}>
          SENAI CIMATEC · Ciência de Dados e Inteligência Artificial
          <br />
          Desenvolvido por: Bruno, Flávio e Karina
        </p>
      </main>
    </>
  );
}
