import importlib.util,tempfile
from pathlib import Path
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('policy',Path(__file__).with_name('flow2api-policy.py'))
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
with tempfile.TemporaryDirectory() as d:
 path=Path(d)/'policy.json';policy=p.AccountPolicy(path);rows=[{'token':SimpleNamespace(id=i)} for i in (1,2,3)]
 assert policy.candidates(rows,'image')[0]['token'].id==1
 policy.selected(1,'image')
 for error in ['timeout','429 too many requests','503 recaptcha evaluation failed','unauthorized','PUBLIC_ERROR_UNUSUAL_ACTIVITY quota exceeded']:
  assert not policy.limited(1,'image',error)
  assert policy.candidates(rows,'image')[0]['token'].id==1
 assert policy.limited(1,'image','Daily quota exceeded')
 assert policy.candidates(rows,'image')[0]['token'].id==2
 assert p.AccountPolicy(path).candidates(rows,'image')[0]['token'].id==2
 assert policy.candidates(rows,'video')[0]['token'].id==1
 for i in (2,3):policy.limited(i,'image','Insufficient credits')
 assert not policy.candidates(rows,'image')
print('FLOW POLICY PASS: stable selection, explicit quota only, persisted cooldown, per-model isolation, exhaustion.')
