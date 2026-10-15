// Plan de grabación: señas útiles de la vida diaria y meta de ejemplos por seña.
export const PLAN_GOAL=10;
export const PLAN_SIGNS=['HOLA','GRACIAS','POR FAVOR','SÍ','NO','AYUDA','BUENOS DÍAS','BUENAS TARDES','BUENAS NOCHES','CHAO','PERDÓN','NOMBRE','SORDO','OYENTE','ENTIENDO','NO ENTIENDO','REPETIR','BAÑO','AGUA','COMER','DÓNDE','CUÁNTO','CUÁNDO','QUÉ','QUIÉN','DINERO','DOCTOR','URGENTE','FAMILIA','TRABAJO'];
export function planCounts(samples){
 const counts=new Map();
 for(const t of samples){if(t.metadata?.captureMode==='background')continue;counts.set(t.label,(counts.get(t.label)||0)+1)}
 return counts;
}
export function planProgress(samples,goal=PLAN_GOAL){
 const counts=planCounts(samples);
 const done=PLAN_SIGNS.filter(label=>(counts.get(label)||0)>=goal).length;
 return {counts,done,total:PLAN_SIGNS.length,goal};
}
export function renderPlan(summary,list,samples,onPick){
 if(!summary||!list)return;
 const {counts,done,total,goal}=planProgress(samples);
 summary.textContent=`${done} de ${total} señas listas (meta: ${goal} ejemplos por seña, en días y lugares distintos)`;
 list.replaceChildren();
 for(const label of PLAN_SIGNS){
  const n=counts.get(label)||0,li=document.createElement('li'),button=document.createElement('button'),small=document.createElement('span');
  button.type='button';button.textContent=(n>=goal?'✓ ':'')+label;small.textContent=`${Math.min(n,goal)}/${goal}`;
  button.className=n>=goal?'plan-done':'';button.append(small);button.onclick=()=>onPick(label);li.append(button);list.append(li);
 }
}
