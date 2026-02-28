import { supabase } from "./supabase.js";
import { el } from "./ui.js";

async function signUp(){
  const email = el("email").value.trim();
  const password = el("password").value;
  if(!email || !password) return alert("Preencha email e senha.");
  const { error } = await supabase.auth.signUp({ email, password });
  if(error) return alert(error.message);
  alert("Conta criada.");
}

async function signIn(){
  const email = el("email").value.trim();
  const password = el("password").value;
  if(!email || !password) return alert("Preencha email e senha.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if(error) return alert(error.message);
  alert("Login realizado.");
}

function wireUI(){
  el("btnSignUp").addEventListener("click", signUp);
  el("btnSignIn").addEventListener("click", signIn);
}

wireUI();