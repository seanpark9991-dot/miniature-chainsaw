const clean=s=>String(s??'').trim();
const topic=s=>{const n=s.charCodeAt(s.length-1)-0xac00;return n>=0&&n<11172?(n%28?'은':'는'):'은(는)'};
export function speakSymbols(input){
 let s=String(input);
 const operand='[+−-]?(?:[A-Za-zα-ω가-힣_][A-Za-zα-ω가-힣_0-9]*|\\d+(?:[.,]\\d+)*)';
 const expression=`${operand}(?:[ \\t]*[+−*/×÷-][ \\t]*${operand})*`;
 const chain=new RegExp(`${expression}(?:[ \\t]*(?:>=|<=|!=|≥|≤|≠|>|<|=)[ \\t]*${expression})+`,'g');
 const number=x=>x.replace(/^[−-]/,'마이너스 ').replace(/^\+/,'플러스 ');
 s=s.replace(chain,match=>{const parts=match.split(/\s*(>=|<=|!=|≥|≤|≠|>|<|=)\s*/);const out=[];for(let i=1;i<parts.length;i+=2){const a=number(parts[i-1]),b=number(parts[i+1]);const rel={'>':'보다 큽니다','<':'보다 작습니다','>=':'보다 크거나 같습니다','≥':'보다 크거나 같습니다','<=':'보다 작거나 같습니다','≤':'보다 작거나 같습니다','!=':'와 같지 않습니다','≠':'와 같지 않습니다','=':'와 같습니다'};out.push(`${a}${topic(a)} ${b}${rel[parts[i]]}`)}return out.join('. 또한 ')});
 const map={'≥':' 크거나 같음 ','≤':' 작거나 같음 ','≠':' 같지 않음 ','≈':' 근사적으로 같음 ','≒':' 근사적으로 같음 ','∞':' 무한대 ','∑':' 합 기호 ','∫':' 적분 기호 ','√':' 제곱근 ','×':' 곱하기 ','÷':' 나누기 ','±':' 플러스 마이너스 ','∴':' 따라서 ','∵':' 왜냐하면 ','∈':' 원소에 속함 ','∉':' 원소에 속하지 않음 ','⊂':' 부분집합 ','∩':' 교집합 ','∪':' 합집합 ','α':' 알파 ','β':' 베타 ','γ':' 감마 ','δ':' 델타 ','θ':' 세타 ','λ':' 람다 ','μ':' 뮤 ','π':' 파이 ','σ':' 시그마 ','Δ':' 델타 ','²':' 제곱 ','³':' 세제곱 ','%':' 퍼센트 ','↑':' 위쪽 화살표 ','↓':' 아래쪽 화살표 ','↔':' 양방향 화살표 ','⇔':' 동치 ','→':' 오른쪽 화살표 ','⇒':' 오른쪽 이중 화살표 ','←':' 왼쪽 화살표 '};
 return s.replace(/<->/g,' 양방향 화살표 ').replace(/->/g,' 오른쪽 화살표 ').replace(/[≥≤≠≈≒∞∑∫√×÷±∴∵∈∉⊂∩∪αβγδθλμπσΔ²³%↑↓↔⇔→⇒←]/g,c=>map[c]).replace(/\+/g,' 더하기 ').replace(/[ \t]{2,}/g,' ').trim();
}
export function parseCSV(text,delimiter=','){
 text=text.replace(/^\uFEFF/,'');if(!text)return[];
 const rows=[];let row=[],cell='',quoted=false,closed=false,started=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){started=true;if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue}
 if(c==='"'){if(cell||closed)throw Error('CSV의 따옴표 형식을 확인해 주세요.');quoted=true;started=true}
 else if(c===delimiter){row.push(cell);cell='';closed=false;started=true}
 else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';closed=false;started=false}
 else{if(closed&&c!==' '&&c!=='\t')throw Error('CSV의 따옴표 뒤 구분자를 확인해 주세요.');if(!closed)cell+=c;started=true}
 }if(quoted)throw Error('CSV의 닫히지 않은 따옴표를 확인해 주세요.');if(started||row.length){row.push(cell);rows.push(row)}return rows;
}
export function tableNarration(b,header=true){
 const rows=b.rows;if(!rows?.length)return[];const width=Math.max(...rows.map(r=>r.length));const hc=Math.min(b.headerRows||(header?1:0),rows.length);
 const labels=Array.from({length:width},(_,c)=>hc?[...new Set(rows.slice(0,hc).map(r=>clean(r[c])).filter(Boolean))].join(' / ')||`${c+1}열`:`${c+1}열`);
 const out=[`${b.title?b.title+'. ':''}표입니다. ${width}개 열, ${rows.length-hc}개 데이터 행입니다.${hc?' 열 제목은 '+labels.join(', ')+'입니다.':''}${b.merged?' 병합된 셀은 해당 행과 열의 범위를 함께 읽습니다.':''}${b.note?' '+b.note:''}`];
 for(let r=hc;r<rows.length;r++){
  let parts=[];for(let c=0;c<width;c++){
   const a=b.grid?.[r]?.[c];if(a&&c!==a.c)continue;
   const label=a?.cs>1?`${labels[c]}부터 ${labels[c+a.cs-1]}까지 병합된 셀`:labels[c];
   const value=clean(rows[r][c]);parts.push(`${label}${topic(label)} ${value?speakSymbols(value)+'입니다':'빈 값입니다'}${a&&r>a.r?' (위 행과 세로 병합)':''}.`);
  }out.push(`${r-hc+1}번째 행. ${parts.join(' ')}`);
 }return out;
}
export function buildEntries(blocks,header,name,warnings=[]){
 const entries=[{kind:'heading',level:4,text:name.replace(/\.[^.]+$/,''),block:-1}];
 blocks.forEach((b,i)=>{
  if(b.kind==='heading'){entries.push({kind:'heading',level:Math.min(6,4+(b.level||1)),text:b.text,block:i});return}
  const lines=b.kind==='table'?tableNarration(b,header):[b.text].filter(Boolean);
  lines.forEach((text,j)=>entries.push({kind:b.kind==='visual'?'visual':'paragraph',text:b.ocrText||b.method==='문자 인식'?text:speakSymbols(text),block:i,source:j===0?b.source:'',method:b.method||''}));
 });
 if(warnings.length){entries.push({kind:'heading',level:5,text:'변환 시 확인할 내용',block:-1});warnings.forEach(text=>entries.push({kind:'notice',text,block:-1}));}
 return entries.map((e,i)=>({...e,id:`reading-${i}`}));
}
export const narrate=(blocks,header,name)=>buildEntries(blocks,header,name).map(e=>e.text);
export function speechChunks(text,limit=220){
 const sentences=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('ko',{granularity:'sentence'}).segment(text)].map(s=>s.segment):[text];
 const out=[];for(const sentence of sentences){let chunk='';for(const word of sentence.split(/(\s+)/)){if(chunk.length+word.length>limit&&chunk.trim()){out.push(chunk.trim());chunk=''}chunk+=word}if(chunk.trim())out.push(chunk.trim())}return out;
}
