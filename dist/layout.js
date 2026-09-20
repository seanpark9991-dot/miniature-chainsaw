// Geometry describes placement only; it never infers causation or arrow direction.
export function describeLayout(items,width,height){
 const clean=items.filter(i=>i.text?.trim()&&Number.isFinite(i.x)&&Number.isFinite(i.y)&&(!('confidence'in i)||i.confidence>=65));
 if(!clean.length||!width||!height)return '';
 const rows=[];for(const i of [...clean].sort((a,b)=>a.y-b.y||a.x-b.x)){
  let row=rows.find(r=>Math.abs(r.y-i.y)<Math.max(8,Math.min(r.height,i.height||16)*.65));
  if(!row){row={y:i.y,height:i.height||16,items:[]};rows.push(row)}row.items.push(i);
 }
 const parts=[];for(const row of rows.slice(0,40)){
  const groups=[];for(const i of row.items.sort((a,b)=>a.x-b.x)){
   const last=groups.at(-1);if(last&&i.x-last.right<Math.max(row.height*1.5,width*.025)){last.text+=(i.x-last.right<row.height*.25?'':' ')+i.text.trim();last.right=i.x+(i.width||0)}
   else groups.push({x:i.x,right:i.x+(i.width||0),text:i.text.trim()});
  }
  const vertical=row.y/height<.33?'위쪽':row.y/height>.67?'아래쪽':'가운데 높이';
  if(groups.length>1)parts.push(`${vertical}에서 왼쪽부터 ${groups.map(g=>'“'+g.text+'”').join(', ')}이(가) 나란히 있습니다.`);
  else{const g=groups[0],center=(g.x+g.right)/2/width,horizontal=center<.33?'왼쪽':center>.67?'오른쪽':'중앙';parts.push(`${vertical} ${horizontal}: ${g.text}.`)}
 }
 if(rows.length>40)parts.push('글자가 많은 자료여서 처음 40줄의 배치를 설명했습니다.');
 return parts.join('\n');
}
