import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name('export-concepts.py')
spec = importlib.util.spec_from_file_location('export_concepts', MODULE)
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)

class ExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.output = self.root / 'private-export'
        self.write('prototypes/ui/_shared/screens.json', {'screens':[{'id':'login','title':'Login','frame':'mobile'}]})
        self.write('prototypes/ui/_shared/journeys/catalog.json', {'screens':[], 'flows':[{'id':'F01','title':'Sign in','steps':['login'],'states':[]}]})
        self.write('prototypes/assets/catalog.json', {'items':[{'id':'asset-1','title':'Welcome','design':'shared','category':'Illustration','path':'art/welcome.png'}]})
        (self.source/'art').mkdir()
        (self.source/'art/welcome.png').write_bytes(b'\x89PNG\r\n\x1a\nsynthetic-fixture')
        self.db = self.root / 'snapshot.sqlite3'
        conn=sqlite3.connect(self.db)
        conn.executescript('''CREATE TABLE comments (id INTEGER,request_id TEXT,variant TEXT,screen TEXT,palette TEXT,author TEXT,body TEXT,principal TEXT,status TEXT,version INTEGER,created_at TEXT,updated_at TEXT,resolved_at TEXT,resolved_by TEXT,resolution TEXT);
CREATE TABLE events (id INTEGER,comment_id INTEGER,status TEXT,author TEXT,principal TEXT,note TEXT,created_at TEXT); PRAGMA user_version=1;''')
        conn.execute('INSERT INTO comments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(1,'request-1','E','asset-1','assets','Imported reviewer','Change color','legacy-user','done',2,'2026-01-01','2026-01-02','2026-01-02','Agent','Updated'))
        conn.execute('INSERT INTO events VALUES (?,?,?,?,?,?,?)',(10,1,'done','Agent','legacy-agent','Updated','2026-01-02'))
        conn.commit();conn.close()
    def tearDown(self): self.tmp.cleanup()
    def write(self, relative, content):
        path=self.source/relative;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(content))
    def test_keeps_asset_comments_events_and_private_provenance(self):
        result=exporter.export_project(self.source,self.output,self.db,'sample','Example',None)
        manifest=json.loads((self.output/'manifest.json').read_text())
        legacy=json.loads((self.output/'legacy-review.json').read_text())
        self.assertEqual(result['comments'],1)
        self.assertEqual(legacy['comments'][0]['targetKey'],'asset-1')
        self.assertEqual(legacy['comments'][0]['principal'],'legacy-user')
        self.assertEqual(legacy['events'][0]['id'],10)
        self.assertNotIn('legacy-user',json.dumps(manifest))
        self.assertEqual(len([x for x in manifest['objects'] if x['kind']=='screen']),12)
        keys={x['key'] for x in manifest['objects']}
        self.assertIn('login:E:',keys);self.assertIn('login:J:',keys)
    def test_missing_target_becomes_archived_tombstone(self):
        conn=sqlite3.connect(self.db);conn.execute("UPDATE comments SET screen='missing',palette='day'");conn.commit();conn.close()
        result=exporter.export_project(self.source,self.output,self.db,'sample','Example',None)
        manifest=json.loads((self.output/'manifest.json').read_text())
        tombstone=next(x for x in manifest['objects'] if x['key']=='missing:E:day')
        self.assertTrue(tombstone['archived']);self.assertEqual(result['orphans'],['missing:E:day'])
    def test_rejects_traversal_and_symlink_assets(self):
        self.write('prototypes/assets/catalog.json', {'items':[{'id':'asset-1','title':'Bad','path':'../private.png'}]})
        with self.assertRaises(ValueError):exporter.export_project(self.source,self.output,self.db,'sample','Example',None)
        self.assertFalse((self.output/'manifest.json').exists())
    def test_refuses_overwrite_or_output_inside_source(self):
        self.output.mkdir()
        with self.assertRaises(ValueError):exporter.export_project(self.source,self.output,self.db,'sample','Example',None)
        with self.assertRaises(ValueError):exporter.export_project(self.source,self.source/'output',self.db,'sample','Example',None)
    def test_rendered_palettes_are_verified_and_linked_to_assets(self):
        import hashlib
        renders=self.root/'renders';renders.mkdir()
        png=b'\x89PNG\r\n\x1a\nsynthetic-render'
        (renders/'view.png').write_bytes(png)
        mapping={'schemaVersion':1,'files':[{'key':'login:E:day','path':'view.png','sha256':hashlib.sha256(png).hexdigest(),'size':len(png),'sourcePath':'prototypes/ui/variant-e-stage/screens/login.html','usedPaths':['art/welcome.png']}]}
        (renders/'mapping.json').write_text(json.dumps(mapping))
        result=exporter.export_project(self.source,self.output,self.db,'sample','Example',None,renders/'mapping.json')
        manifest=json.loads((self.output/'manifest.json').read_text())
        screen=next(x for x in manifest['objects'] if x['key']=='login:E:day')
        self.assertIn('imageFileId',screen['data'])
        self.assertEqual(screen['data']['assetIds'],['asset-1'])
        self.assertNotIn('previewUrl',screen['data'])
        self.assertNotIn('login:E:day',result['missingImages'])
        mapping['files'][0]['sha256']='0'*64
        (renders/'mapping.json').write_text(json.dumps(mapping))
        with self.assertRaises(ValueError):exporter.export_project(self.source,self.root/'bad-export',self.db,'sample','Example',None,renders/'mapping.json')
    def test_require_images_rejects_incomplete_catalog(self):
        with self.assertRaisesRegex(ValueError,'Missing screen images'):
            exporter.export_project(self.source,self.output,self.db,'sample','Example',None,require_images=True)
        self.assertFalse(self.output.exists())
    def test_snapshot_source_unchanged(self):
        before=self.db.read_bytes()
        exporter.export_project(self.source,self.output,self.db,'sample','Example',None)
        self.assertEqual(before,self.db.read_bytes())

if __name__ == '__main__':unittest.main()
