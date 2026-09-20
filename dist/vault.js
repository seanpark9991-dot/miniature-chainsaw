import {supabaseUrl,publishableKey} from './config.js';
const STORAGE='readon-vault-v1';
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=value=>Uint8Array.from(value.match(/../g),v=>parseInt(v,16));
const b64=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function credentials(create=false){
 let saved;try{saved=localStorage.getItem(STORAGE)}catch{throw Error('이 브라우저에서는 보관함 키를 저장할 수 없습니다. TXT 저장을 이용해 주세요.')}
 if(saved){try{const c=JSON.parse(saved);if(/^[0-9a-f]{64}$/.test(c.token)&&/^[0-9a-f]{64}$/.test(c.key))return c}catch{}throw Error('보관함 열쇠를 읽을 수 없습니다. 브라우저 데이터를 지우지 말고 TXT 저장을 이용해 주세요.')}
 if(!create)return null;
 const c={token:hex(crypto.getRandomValues(new Uint8Array(32))),key:hex(crypto.getRandomValues(new Uint8Array(32)))};
 try{localStorage.setItem(STORAGE,JSON.stringify(c));if(localStorage.getItem(STORAGE)!==JSON.stringify(c))throw Error()}catch{throw Error('보관함 열쇠를 저장할 수 없어 온라인 저장을 중단했습니다. TXT 저장을 이용해 주세요.')}
 return c;
}
async function request(path,options,c){
 const response=await fetch(supabaseUrl+'/rest/v1/readon_notes'+path,{...options,headers:{apikey:publishableKey,'x-readon-vault':c.token,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(20000)});
 if(!response.ok){const issue=await response.json().catch(()=>({}));if(issue.message==='vault note limit reached')throw Error('보관함은 최대 30개입니다. 기존 노트를 삭제하거나 TXT로 저장해 주세요.');if(response.status===429||issue.message==='storage capacity or write rate reached')throw Error('현재 온라인 보관함의 저장 한도에 도달했습니다. TXT 저장을 이용하거나 잠시 후 다시 시도해 주세요.');throw Error('보관함 연결이 원활하지 않습니다. 변환 결과는 그대로 있으니 TXT로도 저장할 수 있습니다.')}
 return response.status===204?null:response.json();
}
async function aes(c){return crypto.subtle.importKey('raw',fromHex(c.key),'AES-GCM',false,['encrypt','decrypt'])}
export async function saveNote(result){
 if(!supabaseUrl||!publishableKey)throw Error('온라인 보관함 연결을 준비하고 있습니다. TXT 저장을 이용해 주세요.');
 const c=await (globalThis.navigator?.locks?navigator.locks.request(STORAGE,()=>credentials(true)):Promise.resolve(credentials(true))),id=crypto.randomUUID(),iv=crypto.getRandomValues(new Uint8Array(12));
 const content=JSON.stringify({name:result.name,entries:result.entries,warnings:result.warnings,coverage:result.coverage});
 const bytes=new TextEncoder().encode(content);if(bytes.length>420000)throw Error('이 결과는 보관함에 넣기에는 큽니다. TXT 저장을 이용해 주세요.');
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('readon:v1:'+id),tagLength:128},await aes(c),bytes);
 await request('',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({id,ciphertext:b64(new Uint8Array(ciphertext)),iv:b64(iv),version:1})},c);
 return id;
}
export async function listNotes(){
 const c=credentials();if(!c)return [];
 const rows=await request('?select=id,ciphertext,iv,version,created_at&order=created_at.desc&limit=100',{method:'GET'},c);
 const key=await aes(c);return Promise.all(rows.map(async row=>{
  try{const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(row.iv),additionalData:new TextEncoder().encode('readon:v1:'+row.id),tagLength:128},key,unb64(row.ciphertext));const note=JSON.parse(new TextDecoder().decode(data));if(typeof note.name!=='string'||!Array.isArray(note.entries)||!note.entries.length||note.entries.some(e=>typeof e.text!=='string'))throw Error();return{id:row.id,createdAt:row.created_at,note}}
  catch{return{id:row.id,createdAt:row.created_at,damaged:true}}
 }));
}
export async function deleteNote(id){const c=credentials();if(!c)return;await request('?id=eq.'+encodeURIComponent(id),{method:'DELETE'},c)}
