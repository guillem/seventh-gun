"""Prepare saved generated recordings; never synthesizes a waveform.

Original provider MP3s remain untouched. Runtime edits use mono conversion,
leading-silence trim, sample selection, playback-rate resampling and fades.
"""
from pathlib import Path
import array
import hashlib
import json
import math
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art/modern/roster/audio'
DEST = ROOT / 'public/modern/audio'
RATE = 44100


def decode(path):
    raw = subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-ac','1','-ar',str(RATE),'pipe:1'])
    samples = array.array('f'); samples.frombytes(raw)
    if not samples or max(abs(x) for x in samples) < .001:
        raise ValueError(f'Empty or silent source: {path}')
    return samples


def trim_start(samples):
    threshold = max(.002, max(abs(x) for x in samples) * .022)
    for i in range(0,len(samples)-44,44):
        if math.sqrt(sum(x*x for x in samples[i:i+44])/44) > threshold:
            start=max(0,i-88)
            return samples[start:],start/RATE
    return samples,0


def process(identifier, path, limit=None, rate=1):
    original = decode(path)
    samples, leading = trim_start(original)
    if limit: samples=samples[:round(limit*RATE)]
    if rate != 1:
        size = int((len(samples)-1)/rate)
        shifted=array.array('f')
        for i in range(size):
            index=i*rate; n=int(index); frac=index-n
            shifted.append(samples[n]*(1-frac)+samples[n+1]*frac)
        samples=shifted
    # Two milliseconds on the leading edge prevent a trim click; longer tails
    # on death variants keep the resonant falloff from ending abruptly.
    attack=min(88,len(samples)//10)
    tail=min(int(RATE*(.09 if identifier.endswith('-death') else .03)),len(samples)//4)
    for i in range(attack): samples[i]*=i/attack
    for i in range(tail): samples[-tail+i]*=1-i/tail
    factor=(10**(-3/20))/max(abs(x) for x in samples)
    for i in range(len(samples)): samples[i]*=factor
    out=DEST/(identifier+'.mp3')
    with tempfile.NamedTemporaryFile(suffix='.f32') as tmp:
        tmp.write(samples.tobytes()); tmp.flush()
        subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(RATE),'-ac','1','-i',tmp.name,
            '-c:a','libmp3lame','-b:a','112k','-map_metadata','-1',str(out)],check=True)
    decoded=decode(out)
    return {'id':identifier,'source':str(path.relative_to(ROOT)),
        'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'runtimeSha256':hashlib.sha256(out.read_bytes()).hexdigest(),
        'runtimeBytes':out.stat().st_size,'duration':len(decoded)/RATE,
        'sourceDuration':len(original)/RATE,'leadingTrimSeconds':leading,
        'selectionSeconds':limit,'playbackRateResample':rate,
        'decodedPeak':max(abs(x) for x in decoded),
        'decodedRms':math.sqrt(sum(x*x for x in decoded)/len(decoded)),
        'processing':'mono 44.1kHz, leading trim, 2ms onset/30ms tail fade (90ms death), peak -3dBFS before MP3 112kbps'}


def main():
    DEST.mkdir(parents=True,exist_ok=True)
    report=[]
    # Fast weapons need short report tails so repeated shots stay articulate.
    lengths={'chaingun':.24,'spiker':.42,'dryfire':.22,'hurt':.38}
    for path in sorted((SOURCE/'sources').glob('*.mp3')):
        report.append(process(path.stem,path,lengths.get(path.stem)))
    for creature in ['crawler','slab','wisp','hierophant','fiend']:
        path=SOURCE/'sources'/(creature+'-voice.mp3')
        report.append(process(creature+'-pain',path,.55,1.22))
        report.append(process(creature+'-death',path,1.75,.78))
    report.append(process('husk-death',ROOT/'art/modern/audio-sources/husk-pain.mp3',1.3,.75))
    (SOURCE/'processing.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'files':len(report),'runtimeBytes':sum(x['runtimeBytes'] for x in report),
        'minRms':min(x['decodedRms'] for x in report),'maxDecodedPeak':max(x['decodedPeak'] for x in report)}))


if __name__=='__main__': main()
