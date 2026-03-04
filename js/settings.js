/*
PATCH APPLIED: Supabase configuration file generator
Called when user saves Supabase settings
*/

function generateSupabaseConfigFile(url, key){

  const content =
`window.SUPABASE_CONFIG = {
  url: "${url}",
  anonKey: "${key}"
};`;

  const blob = new Blob([content], { type: "text/javascript" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "supabase-config.js";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* Example hook when saving settings */

function saveSupabaseSettings(url,key){

  localStorage.setItem("supabase_url",url);
  localStorage.setItem("supabase_key",key);

  generateSupabaseConfigFile(url,key);

  console.log("Supabase configuration saved.");
}
