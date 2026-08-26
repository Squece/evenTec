import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { UserProfile } from '../types/models';

interface AuthContextValue {
  usuario: User | null;
  perfil: UserProfile | null;
  carregando: boolean;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<UserProfile | null>(null);
  const [carregandoAuth, setCarregandoAuth] = useState(true);
  const [carregandoPerfil, setCarregandoPerfil] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUsuario(u);
      setCarregandoAuth(false);
      if (!u) {
        setPerfil(null);
        setCarregandoPerfil(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!usuario) return;
    setCarregandoPerfil(true);
    return onSnapshot(doc(db, 'users', usuario.uid), (snap) => {
      setPerfil(snap.exists() ? (snap.data() as UserProfile) : null);
      setCarregandoPerfil(false);
    });
  }, [usuario]);

  async function sair() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ usuario, perfil, carregando: carregandoAuth || carregandoPerfil, sair }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
