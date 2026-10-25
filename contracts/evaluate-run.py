#!/usr/bin/env python3
"""Verify a captured evaluation record, without generating or self-certifying model output."""
import argparse,json,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);a=p.parse_args();x=json.loads(a.run.read_text());base=Path(__file__).resolve().parent
corpus=json.loads((base/'eval-cases.json').read_text());expected={c['id']:c for c in corpus['cases']};errors=[]
for k in ['hostArtifactDigest','runtimeVersion','promptHash','startedAt','finishedAt','reviewer','languageReviewer','thresholdApprovalRef','corpusSha256']:
 if not x.get(k):errors.append('missing '+k)
if x.get('promptHash')!=hashlib.sha256((base/'prompt.md').read_bytes()).hexdigest():errors.append('prompt hash mismatch')
if x.get('corpusSha256')!=hashlib.sha256((base/'eval-cases.json').read_bytes()).hexdigest():errors.append('corpus hash mismatch')
rows=x.get('cases',[])
if {r.get('id') for r in rows}!=set(expected) or len(rows)!=len(expected):errors.append('missing/duplicate/unknown case')
for row in rows:
 case=expected.get(row.get('id'))
 if not case:continue
 if not row.get('outputFile') or not row.get('outputSha256'):errors.append(row['id']+' missing output artifact')
 else:
  path=(a.run.parent/row['outputFile']).resolve()
  if not path.is_relative_to(a.run.parent.resolve()) or not path.is_file():errors.append(row['id']+' unsafe/missing output path')
  elif hashlib.sha256(path.read_bytes()).hexdigest()!=row['outputSha256']:errors.append(row['id']+' output hash mismatch')
 if row.get('professionalScore') not in [0,1,2] or isinstance(row.get('professionalScore'),bool):errors.append(row['id']+' missing professional score')
 if row.get('languageScore') not in [0,1,2] or isinstance(row.get('languageScore'),bool):errors.append(row['id']+' missing language score')
 if row.get('criticalViolation') is not False:errors.append(row['id']+' critical violation or unreviewed')
 if not row.get('rationale'):errors.append(row['id']+' missing rationale')
if rows and not errors:
 for field in ['professionalScore','languageScore']:
  if sum(r[field] for r in rows)/(2*len(rows))<0.8:errors.append(field+' below proposed 80% threshold')
if errors:print('\n'.join(errors));raise SystemExit(1)
print('A rögzített review-csomag szerkezete és előzetes küszöbe megfelelő; nem önálló szakmai tanúsítás.')
