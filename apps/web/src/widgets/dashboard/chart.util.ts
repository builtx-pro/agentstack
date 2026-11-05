type Observation={done:number;total:number};
export function chartPoints(points:Observation[],field:'done'|'total'){const max=Math.max(1,...points.map(p=>p.total),...points.map(p=>p.done));return points.map((p,i)=>`${points.length===1?300:20+i/(points.length-1)*560},${160-p[field]/max*140}`).join(' ');}
export function chartMarker(points:Observation[],field:'done'|'total'){if(points.length!==1)return undefined;const [x,y]=chartPoints(points,field).split(',').map(Number);return{x,y};}
export function historyStartLabel(date:string){return date===new Date().toISOString().slice(0,10)?'History starts today':'History starts here';}
export function chartDate(date:string){const value=new Date(`${date.slice(0,10)}T12:00:00Z`);return Number.isNaN(value.valueOf())?date:new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(value);}
