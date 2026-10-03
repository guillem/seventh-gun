import pathlib, subprocess, array, math, json, hashlib
root=pathlib.Path(__file__).resolve().parents[2]
source=root/'art/modern/audio-sources'
output=root/'public/modern/audio'; output.mkdir(parents=True,exist_ok=True)
report=[]
for path in sorted(source.glob('*.mp3')):
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-ac','1','-ar','44100','pipe:1'])
 samples=array.array('f'); samples.frombytes(raw)
 count=len(samples); peak=max(abs(x) for x in samples)
 start=0; end=count
 if path.stem=='industrial-ambient':
  overlap=11025
  mixed=array.array('f',samples[overlap:-overlap])
  mixed.extend(samples[-overlap+i]*(1-i/(overlap-1))+samples[i]*i/(overlap-1) for i in range(overlap))
  samples=mixed
 else:
  threshold=max(0.003,peak*0.025)
  for i in range(0,count-44,44):
   if math.sqrt(sum(x*x for x in samples[i:i+44])/44)>threshold:
    start=max(0,i-88);break
  samples=samples[start:end]
  fade=min(1323,len(samples))
  for i in range(fade): samples[-fade+i]*=1-i/fade
 normalizer=(10**(-3/20))/max(abs(x) for x in samples)
 for i in range(len(samples)): samples[i]*=normalizer
 rawfile=pathlib.Path('/tmp')/('seventh-'+path.stem+'.f32');rawfile.write_bytes(samples.tobytes())
 dest=output/path.name
 subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar','44100','-ac','1','-i',str(rawfile),'-c:a','libmp3lame','-b:a','112k',str(dest)],check=True)
 report.append({'id':path.stem,'sourceBytes':path.stat().st_size,'runtimeBytes':dest.stat().st_size,'sourceDuration':count/44100,'duration':len(samples)/44100,'leadingTrimSeconds':start/44100,'runtimeSha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'processing':'mono 44.1kHz, peak normalized to -3dBFS, 250ms linear crossfade at loop seam, MP3 112kbps' if path.stem=='industrial-ambient' else 'mono 44.1kHz, leading silence trimmed, 30ms tail fade, peak normalized to -3dBFS, MP3 112kbps'})
(root/'art/modern/audio-processing.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
