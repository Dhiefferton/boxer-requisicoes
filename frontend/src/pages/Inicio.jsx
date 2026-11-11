// pages/Inicio.jsx — escolhe qual Início mostrar.
// O "Início único" (Operações / Armazém / Frotas) está em teste: só o dono (mesmo critério do
// Construtor beta, CONSTRUTOR_DONO) vê. Todos os outros continuam com o Início anterior.
import { useEffect, useState } from 'react';
import { construtorService } from '../services/api';
import InicioClassico from './InicioClassico';
import InicioNovo from './InicioNovo';

export default function Inicio() {
  const [dono, setDono] = useState(null); // null = ainda verificando
  useEffect(() => {
    let vivo = true;
    construtorService.status().then(r => vivo && setDono(!!r.data?.dono)).catch(() => vivo && setDono(false));
    return () => { vivo = false; };
  }, []);
  if (dono === null) return <div className="min-h-screen bg-[var(--c-fundo)]" />;
  return dono ? <InicioNovo /> : <InicioClassico />;
}
