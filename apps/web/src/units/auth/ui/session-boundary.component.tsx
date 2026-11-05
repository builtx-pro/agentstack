import {Fragment,useState,type ReactNode} from 'react';
import {useAuth} from '../service/use-auth.hook';
/** Remount private forms on identity changes, without remounting the first authenticated route. */
export function SessionBoundary({children}:{children:ReactNode}){
 const auth=useAuth(false);
 const [session,setSession]=useState<{identity:string|null|undefined;generation:number}>({identity:undefined,generation:0});
 const identity=auth.data?.user.id??null;
 if(!auth.isPending&&session.identity!==identity){
  setSession({identity,generation:session.identity===undefined?session.generation:session.generation+1});
 }
 return <Fragment key={session.generation}>{children}</Fragment>;
}
