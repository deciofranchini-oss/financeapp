export function moneyBRL(v){
  const n = Number(v ?? 0);
  return n.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}
export function yyyyMmDd(d){
  if(!d) return "";
  return String(d);
}
export function el(id){ return document.getElementById(id); }

export function showTab(tab){
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  ["launches","reports","forecast","settings"].forEach(t=>{
    el(`tab-${t}`).classList.toggle("hidden", t !== tab);
  });
}

export function setOptions(selectEl, items, { value="id", label="name", includeBlank=false, blankLabel="(selecione)" } = {}){
  selectEl.innerHTML = "";
  if(includeBlank){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = blankLabel;
    selectEl.appendChild(opt);
  }
  for(const it of items){
    const opt = document.createElement("option");
    opt.value = it[value];
    opt.textContent = it[label];
    selectEl.appendChild(opt);
  }
}
