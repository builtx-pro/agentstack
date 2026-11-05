const LOCAL_ORIGIN='https://agentstack.invalid';
export function safeInternalReturnTo(value:unknown):string {
 if(typeof value!=='string'||value.length>4000||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(value)||/%(?:2f|5c|0[ad])/i.test(value))return '/';
 try{const url=new URL(value,LOCAL_ORIGIN);if(url.origin!==LOCAL_ORIGIN||url.username||url.password||['/login','/invite'].includes(decodeURIComponent(url.pathname).replace(/\/+$/,'')))return '/';return url.pathname+url.search;}catch{return '/';}
}
