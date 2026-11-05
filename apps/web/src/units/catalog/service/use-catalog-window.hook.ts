import {useState} from 'react';
import {visibleWindow} from '../lib/catalog-window.util';
export function useCatalogWindow<T>(items:T[],key:string,size:number){const [window,setWindow]=useState({key,count:size});const count=window.key===key?window.count:size;return{items:visibleWindow(items,count),hasMore:count<items.length,shown:Math.min(count,items.length),showMore:()=>setWindow({key,count:count+size})};}
