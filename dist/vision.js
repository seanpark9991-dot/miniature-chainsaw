import {describeLayout} from './layout.js';
const abortError=()=>new DOMException('변환을 취소했습니다.','AbortError');
const check=signal=>{if(signal?.aborted)throw abortError()};
function abortable(promise,signal){return new Promise((resolve,reject)=>{const abort=()=>reject(abortError());if(signal?.aborted){reject(abortError());return}signal?.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal?.removeEventListener('abort',abort));});}
async function loadOCR(){if(globalThis.Tesseract)return globalThis.Tesseract;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./vendor/ocr/tesseract.min.js',import.meta.url).href;script.onload=resolve;script.onerror=()=>reject(Error('문자 인식 도구를 불러오지 못했습니다.'));document.head.append(script)});return globalThis.Tesseract;}
async function imageData(image){
 if(image.dataURL)return image.dataURL;const ext=image.path?.split('.').pop().toLowerCase();const type={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',svg:'image/svg+xml'}[ext];if(!type||ext==='svg')throw Error('이 그림 형식은 문자 인식을 지원하지 않습니다.');
 const blob=new Blob([image.bytes],{type});const url=URL.createObjectURL(blob);try{const img=new Image();img.src=url;await img.decode();const ratio=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.9)}finally{URL.revokeObjectURL(url)}
}
async function ocrImage(dataURL){
 const image=new Image();image.src=dataURL;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),data=pixels.data,w=canvas.width,h=canvas.height;const dark=(x,y)=>{const i=(y*w+x)*4;return data[i]+data[i+1]+data[i+2]<450};const erase=[];
 for(let y=0;y<h;y++){let start=-1;for(let x=0;x<=w;x++){if(x<w&&dark(x,y)){if(start<0)start=x}else if(start>=0){if(x-start>w*.1)erase.push([start,y,x,y+1]);start=-1}}}
 for(let x=0;x<w;x++){let start=-1;for(let y=0;y<=h;y++){if(y<h&&dark(x,y)){if(start<0)start=y}else if(start>=0){if(y-start>h*.12)erase.push([x,start,x+1,y]);start=-1}}}
 for(const [x1,y1,x2,y2]of erase)for(let y=y1;y<y2;y++)for(let x=x1;x<x2;x++){const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=255}ctx.putImageData(pixels,0,0);
 const bands=[];let start=-1,last=-1;for(let y=0;y<h;y++){let ink=0;for(let x=0;x<w;x++)if(dark(x,y))ink++;if(ink>3){if(start<0)start=y;last=y}else if(start>=0&&y-last>5){if(last-start>7)bands.push([start,last+1]);start=-1}}if(start>=0&&last-start>7)bands.push([start,last+1]);
 if(!bands.length||bands.length>80)return{images:[{url:canvas.toDataURL('image/png'),left:0,top:0,scale:1,padding:0}],lineMode:false,width:w,height:h};
 const images=bands.map(([top,bottom])=>{let left=w,right=0;for(let y=top;y<bottom;y++)for(let x=0;x<w;x++)if(dark(x,y)){left=Math.min(left,x);right=Math.max(right,x)}const scale=Math.min(1,48/(bottom-top));const line=document.createElement('canvas');line.width=Math.ceil((right-left+1)*scale)+40;line.height=Math.ceil((bottom-top)*scale)+40;const c=line.getContext('2d');c.fillStyle='white';c.fillRect(0,0,line.width,line.height);c.drawImage(canvas,left,top,right-left+1,bottom-top,20,20,(right-left+1)*scale,(bottom-top)*scale);return{url:line.toDataURL('image/png'),left,top,scale,padding:20}});return{images,lineMode:true,width:w,height:h};
}
export async function processVisuals(blocks,{signal,progress=()=>{},ocr=true}={},warnings){
 let worker;const cache=new Map();let current='';const visuals=blocks.filter(b=>b.kind==='visual'&&b.image);let done=0;
 const abort=()=>{worker?.terminate().catch(()=>{})};signal?.addEventListener('abort',abort,{once:true});
 try{for(const b of visuals){check(signal);done++;current=`${b.source||'그림'} · ${done}/${visuals.length}`;progress(`${current} 분석 중`);
  if(!b.unresolved){delete b.image;continue}
  if(cache.has(b.image.path)&&b.image.path){const previous=cache.get(b.image.path);Object.assign(b,{text:`${previous.source}와 같은 이미지입니다. ${previous.text}`,method:previous.method,unresolved:previous.unresolved,ocrText:previous.ocrText,ocrConfidence:previous.ocrConfidence,layoutText:previous.layoutText});delete b.image;continue}
  try{const dataURL=await imageData(b.image);b.preview=dataURL;check(signal);
   if(ocr){
    if(!worker){const api=await abortable(loadOCR(),signal);worker=await abortable(api.createWorker(['kor','eng'],1,{workerPath:new URL('./vendor/ocr/worker.min.js',import.meta.url).href,corePath:new URL('./vendor/ocr/',import.meta.url).href,langPath:new URL('./vendor/ocr/',import.meta.url).href,gzip:false,cacheMethod:'none',workerBlobURL:false,logger:m=>{if(m.status==='recognizing text')progress(`${current} · 글자 읽기 ${Math.round(m.progress*100)}%`)}}).then(w=>{if(signal?.aborted){w.terminate();throw abortError()}return w}),signal);check(signal);await abortable(worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'3'}),signal)}
    const prepared=await ocrImage(dataURL);check(signal);await abortable(worker.setParameters({tessedit_pageseg_mode:prepared.lineMode?'7':'3'}),signal);
    const readings=[],positions=[];for(const part of prepared.images){check(signal);const {data}=await abortable(worker.recognize(part.url,{}, {text:true,blocks:true}),signal);if(/[가-힣A-Za-z0-9]/.test(data.text||''))readings.push(data);
     for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[])for(const word of line.words||[]){const box=word.bbox;if(!box)continue;positions.push({text:word.text,confidence:word.confidence,x:part.left+(box.x0-part.padding)/part.scale,y:part.top+(box.y0-part.padding)/part.scale,width:(box.x1-box.x0)/part.scale,height:(box.y1-box.y0)/part.scale})}
    }
    const confidence=readings.length?readings.reduce((sum,r)=>sum+r.confidence,0)/readings.length:0;check(signal);b.ocrText=readings.map(r=>r.text.trim()).join('\n');b.ocrConfidence=confidence;
    b.layoutText=describeLayout(positions,prepared.width,prepared.height);b.method=b.layoutText?'문자·배치 인식':'문자 인식';
    b.text=b.ocrText?`이미지에서 읽은 글자${confidence<65?' (인식 품질이 낮음)':''}:\n${b.ocrText}${b.layoutText?'\n글자의 배치:\n'+b.layoutText:''}`:'이 그림에서는 읽을 수 있는 글자를 찾지 못했습니다. 사진의 장면이나 색의 의미는 자동 설명하지 못합니다.';
   }else{b.text='문자 인식이 꺼져 있습니다. 이미지 속 글자를 읽으려면 문자 인식을 켜고 다시 변환해 주세요.';b.method='그림'}
   b.unresolved=true;if(b.image.path)cache.set(b.image.path,b);
  }catch(e){if(signal?.aborted||e.name==='AbortError')throw abortError();b.text=`이 그림을 처리하지 못했습니다: ${e.message}`;b.unresolved=true;if(worker)await worker.terminate().catch(()=>{});worker=undefined}
  delete b.image;
 }}finally{signal?.removeEventListener('abort',abort);if(worker)await worker.terminate().catch(()=>{})}
 if(blocks.some(b=>b.ocrText))warnings.add('그림 속 글자와 배치는 기기 내 문자 인식 결과입니다. 숫자·소수점·기호는 오독할 수 있으며, 위치 설명만으로 화살표 방향이나 인과관계를 판단하지 않습니다.');
 for(const b of blocks)if(b.kind==='visual'&&!b.text){b.text='문서에 그림이 표시되어 있으나 이미지 데이터나 작성자의 설명을 찾지 못했습니다.';b.unresolved=true}
}
