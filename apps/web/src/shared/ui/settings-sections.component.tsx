import {useEffect,useState,type ReactNode} from 'react';
import {Tabs,Text} from '@mantine/core';
import {useMediaQuery} from '@mantine/hooks';
import classes from './settings-sections.module.css';
export interface SettingsSection {id:string;label:string;description:string;icon:ReactNode;content:ReactNode}
/** First visits mount a panel; later visits retain unsaved form drafts. */
export function SettingsSections({label,sections,value,onChange}:{label:string;sections:SettingsSection[];value:string;onChange:(value:string)=>void}){
 const [visited,setVisited]=useState(()=>new Set([value]));
 useEffect(()=>setVisited(current=>current.has(value)?current:new Set([...current,value])),[value]);
 const mobile=useMediaQuery('(max-width:48em)',false,{getInitialValueInEffect:false});
 const select=(next:string|null)=>{if(!next||!sections.some(section=>section.id===next))return;setVisited(current=>new Set([...current,next]));onChange(next);};
 return <Tabs value={value} onChange={select} orientation={mobile?'horizontal':'vertical'} variant="pills" keepMounted classNames={{root:classes.layout,list:classes.navigation,tab:classes.tab,panel:classes.panel}}>
  <Tabs.List aria-label={label}>{sections.map(section=><Tabs.Tab key={section.id} value={section.id} aria-label={section.label} aria-description={section.description} leftSection={section.icon}><span className={classes.tabTitle}>{section.label}</span><Text component="span" className={classes.tabDescription}>{section.description}</Text></Tabs.Tab>)}</Tabs.List>
  <div className={classes.content}>{sections.map(section=><Tabs.Panel key={section.id} value={section.id}>{(visited.has(section.id)||section.id===value)&&section.content}</Tabs.Panel>)}</div>
 </Tabs>;
}
