import { useEffect, useId, useState, type FormEvent } from "react";
import { PvpClientError, hasPvpIdentity, pvpAccountName, pvpAccountRefresh, pvpChangePassword, pvpLogin, pvpLogout, pvpRegister } from "../domain/pvp-client";
import { USERNAME_MAX, cleanUsername, passwordProblem, usernameProblem } from "../domain/pvp-account";
import { t } from "../domain/i18n";

// Linha "Conta" das Opções: criar conta, entrar, sair e trocar a senha (usuário + senha, ver server/pvp-accounts.ts). A pessoa continua entrada ao recarregar a
// página porque o aparelho guarda o id do jogador e um segredo só dele (o mesmo localStorage do PvP); a SENHA nunca é guardada pelo app. Para "salvar a senha", os
// campos são de um formulário de verdade com `autocomplete` certo (usuário, senha atual / nova senha), que é o que os gerenciadores de senha dos navegadores
// reconhecem, e, onde o navegador tem a API de credenciais (Chrome, Edge), a senha também é oferecida para salvar explicitamente depois de dar certo.

type Mode = "idle" | "signIn" | "create" | "password";
type Context = "signIn" | "create" | "password";

/** Oferece o par usuário/senha ao gerenciador de senhas do navegador (só onde existe `PasswordCredential`; nos outros, vale o formulário). */
async function offerToSavePassword(username: string, password: string) {
  try {
    const Credential = (window as unknown as { PasswordCredential?: new (data: { id: string; password: string; name?: string }) => Credential }).PasswordCredential;
    if (Credential && navigator.credentials?.store) await navigator.credentials.store(new Credential({ id: username, password, name: username }));
  } catch { /* o navegador decide; sem a API o formulário já cobre */ }
}

function errorText(error: unknown, context: Context): string {
  if (error instanceof PvpClientError) {
    if (error.code === "network") return t.account.errors.network;
    if (error.code === "taken") return t.account.errors.taken;
    if (error.code === "wrong_phase") return t.account.errors.hasAccount;
    if (error.code === "unauthorized") return context === "password" ? t.account.errors.wrongCurrent : t.account.errors.wrong;
    if (error.code === "too_many") { const minutes = /(\d+) min/.exec(error.message); return t.account.errors.locked(minutes ? Number(minutes[1]) : null); }
  }
  return t.account.errors.generic;
}

export function AccountRow() {
  const ids = useId();
  const [username, setUsername] = useState(() => pvpAccountName());
  const [mode, setMode] = useState<Mode>("idle");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // ao abrir as Opções, confere com o servidor se este aparelho ainda está na conta (a senha pode ter sido trocada em outro aparelho)
  useEffect(() => {
    let alive = true;
    void pvpAccountRefresh().then((name) => { if (alive) setUsername(name); });
    return () => { alive = false; };
  }, []);

  const open = (to: Mode) => { setMode(to); setUser(""); setPassword(""); setRepeat(""); setNext(""); setError(""); setMessage(""); };
  const reloadSoon = (text: string) => { setMessage(text); window.setTimeout(() => window.location.reload(), 1200); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || mode === "idle") return;
    setError("");
    const name = cleanUsername(user);
    if (mode === "signIn" || mode === "create") {
      const nameProblem = usernameProblem(name);
      if (nameProblem) { setError(t.account.usernameProblem[nameProblem]); return; }
    }
    if (mode === "signIn") {
      if (!password) { setError(t.account.errors.wrong); return; }
    } else {
      const secret = mode === "password" ? next : password;
      const problem = passwordProblem(secret);
      if (problem) { setError(t.account.passwordProblem[problem]); return; }
      if (mode === "create" && password !== repeat) { setError(t.account.mismatch); return; }
      if (mode === "password" && !password) { setError(t.account.errors.wrongCurrent); return; }
    }
    if (mode === "signIn" && hasPvpIdentity() && !window.confirm(t.account.confirmSignIn)) return;
    setBusy(true);
    try {
      if (mode === "signIn") {
        const saved = await pvpLogin(name, password);
        await offerToSavePassword(saved, password);
        reloadSoon(t.account.signedIn); // recarrega para o app inteiro (fila, amigos, nome) ler a identidade da conta
        return;
      }
      if (mode === "create") {
        const saved = await pvpRegister(name, password);
        setUsername(saved);
        await offerToSavePassword(saved, password);
        open("idle");
        setMessage(t.account.created);
        return;
      }
      await pvpChangePassword(password, next);
      await offerToSavePassword(username, next);
      open("idle");
      setMessage(t.account.passwordChanged);
    } catch (caught) {
      setError(errorText(caught, mode));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (busy || !window.confirm(t.account.confirmSignOut)) return;
    setBusy(true);
    await pvpLogout();
    reloadSoon(t.account.signedOut);
  };

  const field = (suffix: string) => `${ids}-${suffix}`;
  return <div className="cv-row">
    <span className="cv-k">{t.account.label}</span>
    <div className="cv-ctl acct">
      {mode === "idle" && <>
        <p className="cv-hint">{username ? t.account.hintIn(username) : t.account.hintOut}</p>
        <div className="cv-chips">
          {username
            ? <>
              <button type="button" className="cv-chip" disabled={busy} onClick={() => open("password")}>{t.account.changePassword}</button>
              <button type="button" className="cv-chip" disabled={busy} onClick={() => void signOut()}>{t.account.signOut}</button>
            </>
            : <>
              <button type="button" className="cv-chip" disabled={busy} onClick={() => open("signIn")}>{t.account.signIn}</button>
              <button type="button" className="cv-chip" disabled={busy} onClick={() => open("create")}>{t.account.create}</button>
            </>}
        </div>
      </>}
      {mode !== "idle" && <form className="acct-form" onSubmit={(event) => void submit(event)} noValidate>
        {mode === "password"
          // campo de usuário só para o gerenciador de senhas saber a quem pertence a senha nova (fora da vista e fora do teclado)
          ? <input className="acct-ghost" type="text" name="username" autoComplete="username" value={username} readOnly tabIndex={-1} aria-hidden="true" />
          : <label className="pvp-name" htmlFor={field("user")}>
            <span>{t.account.username}</span>
            <input id={field("user")} type="text" name="username" value={user} maxLength={USERNAME_MAX} onChange={(event) => setUser(event.target.value)}
              autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus required />
          </label>}
        {mode === "create" && <p className="cv-hint acct-note">{t.account.usernameHint}</p>}
        <label className="pvp-name" htmlFor={field("pass")}>
          <span>{mode === "password" ? t.account.current : t.account.password}</span>
          <input id={field("pass")} type="password" name="password" value={password} onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "create" ? "new-password" : "current-password"} autoFocus={mode === "password"} required />
        </label>
        {mode === "create" && <label className="pvp-name" htmlFor={field("repeat")}>
          <span>{t.account.repeat}</span>
          <input id={field("repeat")} type="password" name="password-confirm" value={repeat} onChange={(event) => setRepeat(event.target.value)} autoComplete="new-password" required />
        </label>}
        {mode === "password" && <label className="pvp-name" htmlFor={field("next")}>
          <span>{t.account.next}</span>
          <input id={field("next")} type="password" name="new-password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" required />
        </label>}
        {mode !== "signIn" && <p className="cv-hint acct-note">{t.account.passwordHint}</p>}
        {error && <p className="pvp-error" role="alert">{error}</p>}
        <div className="cv-chips">
          <button type="submit" className="cv-chip acct-go" disabled={busy}>{mode === "signIn" ? t.account.signIn : mode === "create" ? t.account.create : t.account.changePassword}</button>
          <button type="button" className="cv-chip" disabled={busy} onClick={() => open("idle")}>{t.account.cancel}</button>
        </div>
      </form>}
      {message && <p className="cv-hint" role="status">{message}</p>}
    </div>
  </div>;
}
