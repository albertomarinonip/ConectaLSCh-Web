import {saveNote,listNotes,deleteNote,copyText} from './content-store.js';
export function initNotes(transcript){
 const $=s=>document.querySelector(s);let selected=null,saving=false;
 const date=iso=>new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));
 async function refresh(){try{const notes=await listNotes(),list=$('#notesList');list.replaceChildren();$('#notesCount').textContent=notes.length;
 if(!notes.length){const p=document.createElement('p');p.className='muted';p.textContent='Todavía no tienes notas. Guarda una desde Escuchar.';list.append(p)}
 for(const note of notes){const b=document.createElement('button'),title=document.createElement('strong'),time=document.createElement('span');b.className='note-item';title.textContent=note.title;time.textContent=date(note.createdAt);b.append(title,time);b.onclick=()=>{selected=note;$('#noteTitle').textContent=note.title;$('#noteDate').textContent=date(note.createdAt);$('#noteText').textContent=note.text;$('#noteDetail').hidden=false;$('#noteActionsStatus').textContent='';$('#noteTitle').focus()};list.append(b)}}catch{$('#notesStatus').textContent='No se pudieron leer las notas. No se borraron datos.'}}
 $('#saveNote').onclick=async()=>{if(saving)return;saving=true;$('#saveNote').disabled=true;try{const {text,segments}=transcript();await saveNote(text,segments);$('#noteStatus').textContent='Nota guardada en Notas.';navigator.storage?.persist?.().catch(()=>{});await refresh()}catch(e){$('#noteStatus').textContent='No se guardó: '+e.message}finally{saving=false;$('#saveNote').disabled=false}};
 $('#copySubtitles').onclick=async()=>{try{$('#noteStatus').textContent=await copyText(transcript().text,$('#subtitleHistory'))}catch(e){$('#noteStatus').textContent=e.message}};
 $('#copyNote').onclick=async()=>{if(selected)$('#noteActionsStatus').textContent=await copyText(selected.text,$('#noteText'))};
 $('#closeNote').onclick=()=>{$('#noteDetail').hidden=true;selected=null};
 $('#deleteNote').onclick=async()=>{if(!selected||!confirm('¿Eliminar esta nota guardada?'))return;$('#deleteNote').disabled=true;try{await deleteNote(selected.id);selected=null;$('#noteDetail').hidden=true;await refresh()}catch{$('#noteActionsStatus').textContent='No se pudo eliminar la nota.'}finally{$('#deleteNote').disabled=false}};
 refresh();return {refresh,isSaving:()=>saving};
}
