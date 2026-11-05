import type {QueryClient} from '@tanstack/react-query';
import type {User} from '@shared/api/schemas';
import {QueryKeys} from '@shared/lib/query-keys.constant';
import {resetAccountAppearance} from '@units/account/lib/appearance.store';
/** Purge sensitive caches before a changed identity is published to React observers. */
export async function reconcileAuthSession(client:QueryClient,next:{user:User}|null){const previous=client.getQueryData<{user:User}|null>(QueryKeys.auth());if(previous?.user.id&&previous.user.id!==next?.user.id){const filter={predicate:(query:{queryKey:readonly unknown[]})=>query.queryKey[0]!=='auth'};await client.cancelQueries(filter);client.removeQueries(filter);client.getMutationCache().clear();resetAccountAppearance();}return next;}
