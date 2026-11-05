import { useSearch,useNavigate } from '@tanstack/react-router';
import { useDebouncedCallback } from '@mantine/hooks';
import { useState } from 'react';
import type { CatalogFilters } from '../model/search.schema';
export function useCatalogFilters(){const filters=useSearch({from:'/projects/$projectId/$section'});const navigate=useNavigate({from:'/projects/$projectId/$section'});const [buffer,setBuffer]=useState({base:filters.q,value:filters.q});const update=(patch:Partial<CatalogFilters>)=>void navigate({search:previous=>({...previous,...patch}),replace:!('selected'in patch)});const debounced=useDebouncedCallback((q:string)=>update({q}),300);return{filters,searchInput:buffer.base===filters.q?buffer.value:filters.q,setSearch:(q:string)=>{setBuffer({base:filters.q,value:q});debounced(q);},update,select:(selected:string)=>update({selected})};}
