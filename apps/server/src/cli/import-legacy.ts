import { readFile, lstat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { importLegacyReview } from '../migration/legacy-import.service.js';

const {values}=parseArgs({options:{project:{type:'string'},file:{type:'string'},'operator-email':{type:'string'},'dry-run':{type:'boolean',default:false},apply:{type:'boolean',default:false}}});
if(values.apply&&values['dry-run']) throw new Error('Choose either --apply or --dry-run, not both.');
if(!values.project||!values.file||!values['operator-email']||!process.env.DATABASE_OWNER_URL) throw new Error('Provide --project UUID --file private-export/legacy-review.json --operator-email administrator; DATABASE_OWNER_URL is required. Defaults to dry-run; --apply commits.');
const stat=await lstat(values.file);
if(!stat.isFile()||stat.isSymbolicLink()||stat.size>100*1024*1024)throw new Error('Expected a regular export file no larger than 100 MiB');
const payload:unknown=JSON.parse(await readFile(values.file,'utf8'));
try {
  const report=await importLegacyReview({ownerUrl:process.env.DATABASE_OWNER_URL,projectId:values.project,operatorEmail:values['operator-email'],payload,dryRun:!values.apply});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
} catch(error) {
  // Do not print a raw driver error/connection string or private imported payload.
  const safe=error instanceof Error && /^(Duplicate legacy|Orphan legacy|An existing enabled|Destination project|Legacy comment|Missing catalog target|Legacy event|Legacy final status)/.test(error.message) ? error.message : 'Legacy import failed. No partial import was committed; check the export and database configuration.';
  process.stderr.write(safe+'\n');process.exitCode=1;
}
