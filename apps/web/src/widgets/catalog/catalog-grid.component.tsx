import {SimpleGrid,Stack,Button,Text,Group} from '@mantine/core';
import type {ProjectObject} from '@shared/api/schemas';
import {ObjectCard} from '@units/catalog/ui/object-card.component';
import {useCatalogWindow} from '@units/catalog/service/use-catalog-window.hook';
export function CatalogGrid({objects,counts,windowKey,onOpen}:{objects:ProjectObject[];counts:Map<string,number>;windowKey:string;onOpen:(id:string)=>void}){const window=useCatalogWindow(objects,windowKey,48);return <Stack><SimpleGrid cols={{base:1,sm:2,lg:3,xl:4}}>{window.items.map(object=><ObjectCard key={object.id} object={object} noteCount={counts.get(object.id)??0} onOpen={()=>onOpen(object.id)}/>)}</SimpleGrid>{window.hasMore&&<Group justify="center" py="md"><Text size="sm" c="dimmed">Showing {window.shown} of {objects.length}</Text><Button variant="light" onClick={window.showMore}>Load 48 more</Button></Group>}</Stack>;}
