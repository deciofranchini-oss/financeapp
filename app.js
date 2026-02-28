import { supabase } from "./supabase.js";
import { el } from "./ui.js";

function setLoggedUI(isLogged) {
  el("authCard").classList.toggle("hidden", isLogged);
  el("appShell").classList.toggle("hidden", !isLogged);
}

async function refreshSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error(error);
    alert(error.message);
    return;
  }
  setLoggedUI(!!data.session);
}

async function signUp() {
  const email = el("email").value.trim();
  const password = el("password").value;
  if (!email || !password) return alert("Preencha email e senha.");

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return alert(error.message);

  alert("Conta criada. Se o Supabase exigir confirmação por email, confirme e depois faça login.");
  await refreshSession();
}

async function signIn() {
  const email = el("email").value.trim();
  const password = el("password").value;
  if (!email || !password) return alert("Preencha email e senha.");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);

  await refreshSession();
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) return alert(error.message);
  await refreshSession();
}

function wireUI() {
  el("btnSignUp").addEventListener("click", signUp);
  el("btnSignIn").addEventListener("click", signIn);
  el("btnLogout").addEventListener("click", signOut);
}

async function main() {
  wireUI();

  // troca de estado automática (recarrega UI se a sessão mudar)
  supabase.auth.onAuthStateChange(() => {
    refreshSession();
  });

  await refreshSession();
}

main();