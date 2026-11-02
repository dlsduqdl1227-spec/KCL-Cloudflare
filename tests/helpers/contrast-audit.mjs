// Inspect rendered text, including placeholders and translucent surface layers.
// This supplements visual review; it does not model text drawn into images/canvas.
export async function auditTextContrast(page, rootSelector='body') {
 return page.evaluate(rootSelector=>{
  function rgb(value){const n=String(value).match(/[\d.]+/g);return n?[+n[0],+n[1],+n[2],n[3]===undefined?1:+n[3]]:[0,0,0,0];}
  function blend(top,bottom){return top.slice(0,3).map((n,i)=>n*top[3]+bottom[i]*(1-top[3])).concat(1);}
  function luminance(color){return color.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);}
  function backgrounds(el){
   const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);
   return chain.reduce((surfaces,p)=>{
    const s=getComputedStyle(p),bases=surfaces.map(bg=>blend(rgb(s.backgroundColor),bg));
    // The 5px select-arrow gradients sit outside the text area, not behind it.
    const arrow=p.tagName==='SELECT'&&s.backgroundSize.split(',').every(size=>size.trim().split(/\s+/).every(v=>v.endsWith('px')&&parseFloat(v)<=16));
    const stops=arrow?null:s.backgroundImage.match(/rgba?\([^)]*\)/g);
    return stops?bases.flatMap(bg=>stops.map(stop=>blend(rgb(stop),bg))).slice(0,32):bases;
   },[[255,255,255,1]]);
  }
  function visible(el){return el.getClientRects().length&&(!el.checkVisibility||el.checkVisibility({visibilityProperty:true,opacityProperty:true}))&&!el.closest('[aria-hidden=true],script,style,template')&&![...document.querySelectorAll('details:not([open])')].some(d=>d.contains(el)&&!d.querySelector('summary')?.contains(el));}
  const failures=[],root=document.querySelector(rootSelector);if(!root)return failures;
  for(const el of [root,...root.querySelectorAll('*')]){
   if(!visible(el)||el.matches(':disabled')||el.closest('button:disabled,[aria-disabled=true]'))continue;
   let text=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim(),placeholder=false;
   if(el.matches('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]),textarea')){placeholder=!el.value;text=el.value||el.placeholder;}
   if(el.tagName==='SELECT')text=el.selectedOptions[0]?.textContent||'';
   if(!text||!/[\p{L}\p{N}]/u.test(text))continue;
   const s=getComputedStyle(el,placeholder?'::placeholder':null),base=getComputedStyle(el),candidates=backgrounds(el).map(bg=>{const a=luminance(bg),b=luminance(blend(rgb(s.color),bg));return {bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};}).sort((a,b)=>a.ratio-b.ratio),{bg,ratio}=candidates[0],size=parseFloat(base.fontSize),min=size>=24||(size>=18.66&&parseInt(base.fontWeight)>=700)?3:4.5;
   if(ratio+.01<min)failures.push({element:el.id||((el.closest('[id]')?.id||'')+' '+el.tagName.toLowerCase()+'.'+String(el.className).split(' ')[0]),text:text.slice(0,70),ratio:+ratio.toFixed(2),min,foreground:s.color,background:bg.slice(0,3).map(Math.round)});
  }
  return failures;
 },rootSelector);
}
