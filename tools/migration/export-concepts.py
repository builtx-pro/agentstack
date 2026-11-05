#!/usr/bin/env python3
"""Export a Concepts v1 catalog and consistent SQLite SNAPSHOT into private migration files.

Read-only source, no network, no imports into a running service. Never point this at a live WAL
file: make a SQLite backup with the legacy service's supported backup command first.
"""
import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
from urllib.parse import quote, urlparse

VARIANTS = {'E': 'variant-e-stage', 'J': 'variant-j-city'}
PALETTES = {'E': ['', 'acid', 'ultramarine', 'tomato', 'sunset', 'mint', 'day'],
            'J': ['', 'blue', 'green', 'berry', 'night']}

def read_json(path):
    with path.open(encoding='utf-8') as handle:
        return json.load(handle)

def safe_source(root, relative):
    path = Path(relative)
    if path.is_absolute() or '..' in path.parts:
        raise ValueError('Asset paths must stay inside the source directory')
    current = root
    for part in path.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError('Symbolic links are not accepted as migration assets')
    resolved = current.resolve()
    if root != resolved and root not in resolved.parents:
        raise ValueError('Asset path escapes source directory')
    return resolved

def read_snapshot(database):
    if not database:
        return [], []
    path=Path(database).resolve()
    if not path.is_file() or path.is_symlink():
        raise ValueError('A regular SQLite snapshot is required')
    if Path(str(path)+'-wal').exists():
        raise ValueError('Use a consistent backup, not a live SQLite database with WAL')
    uri='file:'+quote(str(path))+'?mode=ro&immutable=1'
    with sqlite3.connect(uri, uri=True) as db:
        db.row_factory=sqlite3.Row
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Snapshot integrity check failed')
        if db.execute('PRAGMA user_version').fetchone()[0] != 1:
            raise ValueError('Unsupported legacy database version')
        comments=[dict(row) for row in db.execute('SELECT * FROM comments ORDER BY id')]
        events=[dict(row) for row in db.execute('SELECT * FROM events ORDER BY id')]
    comment_ids={item['id'] for item in comments}
    if any(item['comment_id'] not in comment_ids for item in events):
        raise ValueError('Orphan legacy event: reconciliation is required')
    return comments,events

def draft(key, kind, title, data, **extras):
    return {'key':key,'kind':kind,'title':title,'description':'','tags':[],
            'visibility':'customer','status':'backlog','data':data,**extras}

def export_project(source, output, snapshot, slug, name, preview_base, rendered_images=None, require_images=False):
    source=Path(source).resolve();output=Path(output).absolute()
    if output.exists() or source == output.resolve() or source in output.resolve().parents:
        raise ValueError('Use a new private output directory outside the source checkout')
    if preview_base:
        parsed=urlparse(preview_base)
        if parsed.scheme not in ('https','http') or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('Preview base must be an HTTP(S) URL without credentials')
    catalog=read_json(source/'prototypes/ui/_shared/journeys/catalog.json')
    originals=read_json(source/'prototypes/ui/_shared/screens.json')['screens']
    assets=read_json(source/'prototypes/assets/catalog.json')['items']
    screens={item['id']:item for item in originals+catalog['screens']}
    comments,events=read_snapshot(snapshot)
    objects=[];files={};orphans=[];missing=[];screen_keys=set()
    rendered={};render_root=None
    if rendered_images:
        mapping_path=Path(rendered_images).absolute()
        if mapping_path.is_symlink():raise ValueError('Rendered mapping must not be a symlink')
        mapping=read_json(mapping_path)
        if mapping.get('schemaVersion')!=1:raise ValueError('Unsupported rendered image mapping')
        render_root=mapping_path.resolve().parent
        for item in mapping.get('files',[]):
            if item['key'] in rendered:raise ValueError('Duplicate rendered screen key')
            path=safe_source(render_root,item['path'])
            if not path.is_file() or path.stat().st_size!=item['size'] or hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:
                raise ValueError('Rendered image checksum mismatch')
            if path.suffix.lower()!='.png':raise ValueError('Rendered screen must be a PNG')
            rendered[item['key']]=item
    asset_paths={}
    for asset in assets:asset_paths.setdefault(asset['path'],[]).append(asset['id'])
    def register_file(relative, file_root=None):
        file_root=file_root or source
        path=safe_source(file_root,relative)
        if not path.is_file():
            missing.append(relative);return None
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        suffix=path.suffix.lower()
        key='sha256:'+digest
        if key not in files:
            files[key]={'key':key,'path':'files/'+digest+suffix,'sha256':digest,
                        'size':path.stat().st_size,'mimeType':mimetypes.guess_type(path.name)[0] or 'application/octet-stream',
                        'sourcePath':relative,'sourceRoot':file_root}
        return key
    palettes={variant:set(values) for variant,values in PALETTES.items()}
    for c in comments:
        if c['palette']!='assets':palettes.setdefault(c['variant'],{''}).add(c['palette'])
    for variant,folder in VARIANTS.items():
        for palette in sorted(palettes.get(variant,{''})):
            for screen_id,item in screens.items():
                key=f'{screen_id}:{variant}:{palette}';screen_keys.add(key)
                data={'screenId':screen_id,'variant':variant,'palette':palette,'frame':item.get('frame','mobile'),
                      'sourcePath':f'prototypes/ui/{folder}/screens/{screen_id}.html'}
                if not palette:
                    filekey=register_file(f'prototypes/ui/{folder}/png/{screen_id}.png')
                    if filekey:data['imageFileId']='@file:'+filekey
                if key in rendered:
                    image=rendered[key]
                    if image.get('sourcePath')!=data['sourcePath']:raise ValueError('Rendered image source does not match screen')
                    data['imageFileId']='@file:'+register_file(image['path'],render_root)
                    data['assetIds']=sorted({asset_id for path in image.get('usedPaths',[]) for asset_id in asset_paths.get(path,[])})
                if preview_base:
                    data['previewUrl']=preview_base.rstrip('/')+'/'+data['sourcePath']+(('?palette='+quote(palette)) if palette else '')
                objects.append(draft(key,'screen',item['title'],data,description=item.get('description',item.get('must','')),tags=item.get('tags',[])))
            for flow in catalog['flows']:
                keys=[f'{sid}:{variant}:{palette}' for sid in flow.get('steps',[]) if sid in screens]
                states=[f'{sid}:{variant}:{palette}' for sid in flow.get('states',[]) if sid in screens]
                objects.append(draft(f"flow:{flow['id']}:{variant}:{palette}",'flow',flow['title'],
                    {'screenIds':list(dict.fromkeys(keys)),'stateIds':list(dict.fromkeys(states)),'role':flow.get('role',''),'phase':flow.get('phase','')},
                    description=flow.get('description',''),tags=[variant]+([palette] if palette else [])))
    if set(rendered)-screen_keys:raise ValueError('Rendered mapping includes unknown screen keys')
    asset_ids=set()
    for asset in assets:
        key=asset['id'];asset_ids.add(key)
        data={'category':asset.get('category',''),'variant':asset.get('design','shared'),
              'source':asset.get('source',asset['path'])}
        filekey=register_file(asset['path'])
        if filekey:data['fileId']='@file:'+filekey
        objects.append(draft(key,'asset',asset['title'],data,tags=[asset.get('design','shared'),asset.get('category','')]))
    known={obj['key'] for obj in objects}
    for c in comments:
        key=c['screen'] if c['palette']=='assets' else f"{c['screen']}:{c['variant']}:{c['palette']}"
        c['targetKey']=key;c['importedAuthorUnverified']=True
        if key not in known:
            kind='asset' if c['palette']=='assets' else 'screen'
            data={} if kind=='asset' else {'screenId':c['screen'],'variant':c['variant'],'palette':c['palette']}
            objects.append(draft(key,kind,'Archived legacy target: '+c['screen'],data,archived=True))
            known.add(key);orphans.append(key)
    if len(known)!=len(objects):raise ValueError('Duplicate target keys in catalog')
    missing_images=[o['key'] for o in objects if o['kind']=='screen' and not o.get('archived') and not o['data'].get('imageFileId')]
    if require_images and missing_images:raise ValueError(f'Missing screen images: {len(missing_images)}')
    # Private provenance remains separate from the portable content manifest.
    legacy={'schemaVersion':1,'legacySource':'concepts-v1:'+slug,'comments':comments,'events':events}
    manifest={'schemaVersion':1,'project':{'name':name,'slug':slug},'objects':objects,
              'files':[{k:v for k,v in item.items() if k not in ('sourcePath','sourceRoot')} for item in files.values()]}
    report={'objects':len(objects),'screens':sum(o['kind']=='screen' for o in objects),
            'assets':len(assets),'flows':sum(o['kind']=='flow' for o in objects),
            'files':len(files),'comments':len(comments),'events':len(events),
            'orphans':orphans,'missingFiles':sorted(set(missing)),'missingImages':missing_images,
            'notes':'Private export. Imported author labels are unverified. No original data was modified.'}
    output.parent.mkdir(parents=True,exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix='.agentstack-export-',dir=output.parent))
    os.chmod(stage,0o700)
    try:
        (stage/'files').mkdir(mode=0o700)
        for item in files.values():
            src=safe_source(item['sourceRoot'],item['sourcePath']);dest=stage/item['path']
            shutil.copyfile(src,dest);os.chmod(dest,0o600)
            if hashlib.sha256(dest.read_bytes()).hexdigest()!=item['sha256']:
                raise ValueError('Source file changed during export; retry from a stable release')
        for filename,data in [('manifest.json',manifest),('legacy-review.json',legacy),('report.json',report)]:
            path=stage/filename;path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');os.chmod(path,0o600)
        stage.rename(output)
    except Exception:
        shutil.rmtree(stage)
        raise
    return report

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--snapshot',type=Path)
    parser.add_argument('--slug',required=True)
    parser.add_argument('--name',required=True)
    parser.add_argument('--preview-base')
    parser.add_argument('--rendered-images',type=Path,help='Verified palette-render mapping JSON; paths relative to this file')
    parser.add_argument('--require-images',action='store_true',help='Fail if any active screen has no screenshot')
    args=parser.parse_args()
    report=export_project(args.source,args.output,args.snapshot,args.slug,args.name,args.preview_base,args.rendered_images,args.require_images)
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
