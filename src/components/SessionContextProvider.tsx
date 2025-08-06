import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";

type Session = {
  user: any;
  access_token: string;
} | null;

const SessionContext = createContext<{ session: Session }>({ session: null });

export function useSession() {
  return useContext(SessionContext);
}

export function SessionContextProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session && location.pathname === "/login") {
        navigate("/");
      }
      if (!session && location.pathname !== "/login") {
        navigate("/login");
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line
  }, [navigate, location.pathname]);

  // Redirect on initial load
  useEffect(() => {
    if (session && location.pathname === "/login") {
      navigate("/");
    }
    if (!session && location.pathname !== "/login") {
      navigate("/login");
    }
    // eslint-disable-next-line
  }, [session, location.pathname, navigate]);

  return (
    <SessionContext.Provider value={{ session }}>
      {children}
    </SessionContext.Provider>
  );
}