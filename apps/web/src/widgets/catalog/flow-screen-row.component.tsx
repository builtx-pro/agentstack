import {Stack,Group,Button,Text} from '@mantine/core';
import type {ProjectObject} from '@shared/api/schemas';
import {ObjectCard} from '@units/catalog/ui/object-card.component';
import {useCatalogWindow} from '@units/catalog/service/use-catalog-window.hook';
import classes from './catalog.module.css';
export function FlowScreenRow({screens,counts,onOpen,windowKey}:{screens:ProjectObject[];counts:Map<string,number>;onOpen:(id:string)=>void;windowKey:string}){const window=useCatalogWindow(screens,windowKey,12);return <Stack gap="xs"><div className={classes.flowRow} tabIndex={0} role="region" aria-label="Ordered flow screens">{window.items.map((screen,index)=><div key={screen.id} className={classes.flowCell}><Text size="xs" fw={600} c="dimmed" mb={7}>{String(index+1).padStart(2,'0')}</Text><ObjectCard object={screen} noteCount={counts.get(screen.id)??0} onOpen={()=>onOpen(screen.id)}/></div>)}</div>{window.hasMore&&<Group justify="flex-end"><Text size="xs" c="dimmed">Showing {window.shown} of {screens.length} screens</Text><Button size="xs" variant="light" onClick={window.showMore}>Show next 12</Button></Group>}</Stack>;}
