import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null;
const Context = createContext(null);
export function BackendProvider({ children }) {
  const [session, setSession] = useState(null),
    [roles, setRoles] = useState([]),
    [loading, setLoading] = useState(configured),
    [error, setError] = useState(""),
    [recovery, setRecovery] = useState(false);
  const loadRoles = useCallback(async (user) => {
    if (!user) {
      setRoles([]);
      return;
    }
    const { data, error } = await supabase
      .from("role_assignments")
      .select("*")
      .eq("user_id", user.id);
    if (error) setError("Unable to load permissions. Please retry.");
    else setRoles(data || []);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) setError("Session could not be restored.");
      setSession(data.session);
      await loadRoles(data.session?.user);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setTimeout(() => loadRoles(next?.user), 0);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadRoles]);
  return (
    <Context.Provider
      value={{
        session,
        roles,
        loading,
        error,
        recovery,
        setRecovery,
        refreshRoles: () => loadRoles(session?.user),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useBackend = () => useContext(Context);
export function friendly(error) {
  if (!error) return "";
  if (error.code === "23505")
    return "A record with these details already exists.";
  if (error.code === "23503") return "Select valid related records.";
  if (error.code === "23514") return "A value is outside its permitted range.";
  if (error.code === "42501")
    return "Your account does not have permission for this action.";
  return "The request failed. Check your connection, input and permissions, then retry.";
}
export async function operation(name, args) {
  const { data, error } = await supabase.functions.invoke("operations", {
    body: { operation: name, args },
  });
  if (error) {
    let message = "Operation failed. Please retry.";
    try {
      message = (await error.context.json()).error || message;
    } catch {
      /* no response body */
    }
    throw new Error(message);
  }
  if (data.error) throw new Error(data.error);
  return data.data;
}
export function AuthForm({ register = false, role = "resident", go }) {
  const { session, recovery, setRecovery } = useBackend();
  const [mode, setMode] = useState(register ? "register" : "login"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState("");
  useEffect(() => {
    setMode(register ? "register" : "login");
    setFailure("");
    setMessage("");
  }, [register, role]);
  async function submit(e) {
    e.preventDefault();
    setFailure("");
    setMessage("");
    if (!supabase) {
      setFailure(
        "Configure the public Supabase environment variables to enable authentication.",
      );
      return;
    }
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({
          password: f.password,
        });
        if (error) throw error;
        setRecovery(false);
        setMessage("Password updated.");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(f.email, {
          redirectTo: location.origin + "/#/login",
        });
        if (error) throw error;
        setMessage(
          "If this address is registered, a recovery email will arrive.",
        );
      } else if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: f.email,
          password: f.password,
          options: {
            data: { full_name: f.full_name },
            emailRedirectTo: location.origin + "/#/login",
          },
        });
        if (error) throw error;
        setMessage(
          data.session
            ? "Account created. Submit your society application below."
            : "Check your email to confirm your account, then sign in and submit your society application.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: f.email,
          password: f.password,
        });
        if (error) throw error;
        go("/workspace/" + role);
      }
    } catch {
      setFailure(
        "Authentication request could not be completed. Check your details, email confirmation and connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form onSubmit={submit}>
        <h3>
          {recovery
            ? "Choose a new password"
            : mode === "reset"
              ? "Recover your account"
              : mode === "register"
                ? "Create a secure account"
                : "Sign in"}
        </h3>
        {mode === "register" && !recovery && (
          <label>
            Your name
            <input
              name="full_name"
              required
              maxLength={120}
              autoComplete="name"
            />
          </label>
        )}
        {!recovery && (
          <label>
            Email address
            <input name="email" type="email" required autoComplete="username" />
          </label>
        )}
        {(recovery || mode !== "reset") && (
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
            <small>Use at least 12 characters.</small>
          </label>
        )}
        {failure && (
          <p role="alert" className="form-error">
            {failure}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <button className="btn full" disabled={busy || !configured}>
          {busy
            ? "Please wait…"
            : recovery
              ? "Update password"
              : mode === "reset"
                ? "Send recovery link"
                : mode === "register"
                  ? "Create account"
                  : "Sign in"}
        </button>
      </form>
      {!configured && (
        <p role="alert">
          Backend configuration is missing. See SETUP.md; no credentials will be
          sent.
        </p>
      )}
      {!recovery && (
        <div className="role-login-links">
          <button className="plain" onClick={() => setMode("login")}>
            Sign in
          </button>
          <button className="plain" onClick={() => setMode("register")}>
            Create resident / applicant account
          </button>
          <button className="plain" onClick={() => setMode("reset")}>
            Forgot password?
          </button>
        </div>
      )}
      {session && (
        <>
          <p>
            Signed in as {session.user.email}. Your user ID:{" "}
            <code>{session.user.id}</code>
          </p>
          <button className="outline" onClick={() => go("/workspace/" + role)}>
            Open workspace
          </button>
          <button className="plain" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
          <ApplicationForm />
        </>
      )}
    </>
  );
}
export function ApplicationForm() {
  const { session } = useBackend();
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h3>Society approval application</h3>
      <p>
        Submit ownership and administrator-authority evidence. Platform approval
        is required before society access is granted.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = Object.fromEntries(new FormData(e.currentTarget));
          const { error } = await supabase
            .from("registration_requests")
            .insert({ ...f, applicant_id: session.user.id });
          setStatus(
            error ? friendly(error) : "Application submitted for review.",
          );
          setBusy(false);
        }}
      >
        <label>
          Society name
          <input name="society_name" required minLength={2} maxLength={160} />
        </label>
        <label>
          Address
          <input name="address" required minLength={5} maxLength={500} />
        </label>
        <label>
          Evidence and authority reference
          <textarea name="evidence" required minLength={10} maxLength={2000} />
        </label>
        <button className="btn" disabled={busy}>
          Submit application
        </button>
        <p role="status">{status}</p>
      </form>
    </section>
  );
}
