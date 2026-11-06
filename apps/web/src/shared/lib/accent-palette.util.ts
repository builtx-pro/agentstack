import type {MantineColorsTuple} from '@mantine/core';
export const DEFAULT_ACCENT='#d9480f';
export const ACCENT_PRESETS=[{name:'Orange',color:DEFAULT_ACCENT},{name:'Blue',color:'#228be6'},{name:'Teal',color:'#0c8599'},{name:'Green',color:'#2b8a3e'},{name:'Rose',color:'#d6336c'},{name:'Violet',color:'#7950f2'},{name:'Amber',color:'#b7791f'},{name:'Slate',color:'#495057'}] as const;
export const normalizeAccent=(value:unknown)=>typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value)?value.toLowerCase():DEFAULT_ACCENT;
const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const hex=(channels:number[])=>'#'+channels.map(c=>Math.max(0,Math.min(255,Math.round(c))).toString(16).padStart(2,'0')).join('');
function mix(color:string,toward:string,amount:number){const a=rgb(color),b=rgb(toward);return hex(a.map((v,i)=>v+(b[i]!-v)*amount))}
function luminance(color:string){const channels=rgb(color).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4});return channels[0]!*.2126+channels[1]!*.7152+channels[2]!*.0722}
export function contrastRatio(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
/** Keep the user's hue, darkening the filled-button shade until white text reaches WCAG AA. */
export function accentPalette(value:unknown):MantineColorsTuple {
 const chosen=normalizeAccent(value);let base=chosen;
 for(let step=1;contrastRatio(base,'#ffffff')<4.5&&step<=100;step++)base=mix(chosen,'#000000',step/100);
 return [mix(base,'#ffffff',.96),mix(base,'#ffffff',.89),mix(base,'#ffffff',.76),mix(base,'#ffffff',.58),mix(base,'#ffffff',.36),mix(base,'#ffffff',.12),base,mix(base,'#000000',.15),mix(base,'#000000',.3),mix(base,'#000000',.5)] as MantineColorsTuple;
}
