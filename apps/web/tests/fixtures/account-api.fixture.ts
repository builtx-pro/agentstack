import type {Page} from '@playwright/test';
export async function setupAccountApi(page:Page,options:{signedIn?:boolean;mfa?:boolean;locale?:'ru'|'en'|null}={}){
 let signedIn=options.signedIn??true;let conflict=false;let nextInvalidFactor=false;const writes:{path:string;body:any}[]=[];
 const user={id:'account-user',name:'Demo reviewer',email:'reviewer@example.test',isAdmin:true};
 const account={user,version:1,preferences:{locale:options.locale??'en',theme:'light',accent:'#7950f2',onboardingCompleted:false},avatarUrl:null as string|null,mfaEnabled:options.mfa??false,recoveryCodesRemaining:0};
 const sessions=[{id:'current-session',createdAt:'2026-11-05T12:00:00Z',expiresAt:'2026-11-12T12:00:00Z',current:true},{id:'other-session',createdAt:'2026-11-04T12:00:00Z',expiresAt:'2026-11-11T12:00:00Z',current:false}];
 const codes=Array.from({length:10},(_,i)=>`ABCDE-F0123-45678-${String(i).padStart(5,'0')}`);
 await page.route('**/api/v1/**',async route=>{const request=route.request();const url=new URL(request.url());const path=url.pathname.replace('/api/v1',''),method=request.method();const body=request.headers()['content-type']?.includes('application/json')?request.postDataJSON():null;const respond=(json:unknown,status=200)=>route.fulfill({status,json});
  if(method!=='GET')writes.push({path,body});
  if(path==='/auth/login'){if(account.mfaEnabled)return respond({mfaRequired:true,challenge:'synthetic-challenge-for-browser-tests-only',expiresAt:new Date(Date.now()+300000).toISOString()});signedIn=true;return respond({user});}
  if(path==='/auth/mfa/verify'){if(nextInvalidFactor){nextInvalidFactor=false;return respond({error:{code:'invalid_factor',message:'Invalid factor'}},401);}if(body.code!=='123456'&&body.code!==codes[0])return respond({error:{code:'invalid_factor',message:'Invalid factor'}},401);signedIn=true;return respond({user});}
  if(!signedIn)return respond({error:{code:'unauthorized',message:'Sign in'}},401);
  if(path==='/auth/me')return respond({user});if(path==='/auth/logout'){signedIn=false;return respond({ok:true});}
  if(path==='/account'&&method==='GET')return respond(account);
  if(path==='/account'&&method==='PATCH'){if(conflict){conflict=false;account.version++;return respond({error:{code:'version_conflict',message:'Changed'}},409);}if(body.expectedVersion!==account.version)return respond({error:{code:'version_conflict',message:'Changed'}},409);if(body.name)user.name=body.name;Object.assign(account.preferences,body.preferences);account.version++;return respond(account);}
  if(path==='/account/avatar'&&['PUT','DELETE'].includes(method)){account.version++;account.avatarUrl=method==='PUT'?'/api/v1/account/avatar?v='+account.version:null;return respond(account);}
  if(path==='/account/avatar')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#7950f2"/></svg>'});
  if(path==='/account/mfa/setup')return respond({secret:'JBSWY3DPEHPK3PXP',otpauthUrl:'otpauth://totp/AgentStack:synthetic?secret=JBSWY3DPEHPK3PXP&issuer=AgentStack',expiresAt:new Date(Date.now()+600000).toISOString()});
  if(path==='/account/mfa/confirm'){if(body.code!=='123456')return respond({error:{code:'invalid_factor'}},401);account.mfaEnabled=true;account.recoveryCodesRemaining=10;account.version++;return respond({account,recoveryCodes:codes});}
  if(path==='/account/mfa/recovery-codes'||path==='/account/mfa/disable'){if(body.code!=='123456'&&body.code!==codes[0])return respond({error:{code:'invalid_factor'}},401);account.mfaEnabled=path.endsWith('recovery-codes');account.recoveryCodesRemaining=account.mfaEnabled?10:0;account.version++;return respond({account,...(account.mfaEnabled?{recoveryCodes:codes}:{})});}
  if(path==='/account/sessions')return respond({items:sessions});
  if(path==='/account/sessions/revoke-others'){sessions.splice(1);account.version++;return respond({ok:true,currentRevoked:false});}
  if(path.startsWith('/account/sessions/')&&method==='DELETE'){const index=sessions.findIndex(session=>path.endsWith(session.id));const removed=sessions.splice(index,1)[0];if(removed?.current)signedIn=false;account.version++;return respond({ok:true,currentRevoked:!!removed?.current});}
  if(path==='/account/password'){signedIn=false;return respond({ok:true});}
  if(path==='/account/history')return respond({items:[{id:'history-one',version:account.version,action:'profile.updated',createdAt:'2026-11-05T12:00:00Z',snapshot:{name:user.name}}]});
  if(path==='/projects')return respond({items:[],nextCursor:null});
  return respond({error:{code:'not_found',message:'Unavailable'}},404);
 });
 return {account,writes,codes,conflict:()=>{conflict=true;},invalidFactor:()=>{nextInvalidFactor=true;},externalAccent:()=>{account.preferences.accent='#d6336c';account.version++;},externalName:()=>{user.name='Changed in another tab';account.version++;},switchUser:()=>{user.id='other-user';user.name='Other account';account.version++;},signOut:()=>{signedIn=false;}};
}
