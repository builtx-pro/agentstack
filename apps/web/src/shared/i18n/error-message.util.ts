import {translate} from './locale-store';
/** Translate stable error codes; do not display arbitrary server internals as UI copy. */
export function errorMessage(error:unknown):string{
 if(error&&typeof error==='object'&&'status'in error){
  const status=Number(error.status);
  const code='code'in error?String(error.code):'';
  if(code==='invalid_credentials')return translate('Email or password is incorrect.');
  if(status===401)return translate('Sign in again to continue.');
  if(status===403)return translate('You do not have permission for this action.');
  if(status===404)return translate('This item is unavailable.');
  if(status===409)return translate('This item changed. Refresh it and try again.');
  if(status===413)return translate('This file or request is too large.');
  if(status===429)return translate('Too many requests. Wait a moment and try again.');
  if(status===400||status===422)return translate('Check the entered values and try again.');
  if(status>=500)return translate('The server could not complete the request. Try again later.');
 }
 if(error instanceof TypeError)return translate('Could not connect. Check your connection and try again.');
 if(error instanceof Error)return translate(error.message);
 return translate('Unexpected error');
}
