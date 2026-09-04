import re,subprocess,glob,os,sys
def rules(css):
    nc=re.sub(r'/\*.*?\*/','',css,flags=re.S); out=[]; i=0
    while True:
        j=nc.find('{',i)
        if j<0: break
        sel=' '.join(nc[i:j].split()).lstrip('} ').strip()
        if sel.startswith('@'): i=j+1; continue
        d=1;k=j+1
        while d and k<len(nc):
            d+= nc[k]=='{'; d-= nc[k]=='}'; k+=1
        if sel: out.append((sel,' '.join(nc[j+1:k-1].split())))
        i=k
    return out
def simple(sel): return [s.strip() for s in sel.split(',') if s.strip()]
def props(body): return set(p.split(':')[0].strip() for p in body.split(';') if ':' in p)
total_problems=0
for app,shell,comp_glob,orig in [('mobile','src/app/mobile/styles/mobile.css','src/app/mobile/**/*.css','apps/web/src/app/mobile/styles/mobile.css'),('desktop','src/app/desktop/styles/desktop.css','src/app/desktop/**/*.css','apps/web/src/app/desktop/styles/desktop.css')]:
    o=rules(subprocess.run(['git','show',f'f31cc27:{orig}'],capture_output=True,text=True,cwd='../..').stdout)
    opos={}
    for i,(s,b) in enumerate(o): opos.setdefault((s,b),i)
    shell_rules=rules(open(shell).read()); comps=[f for f in glob.glob(comp_glob,recursive=True) if os.path.abspath(f)!=os.path.abspath(shell)]
    comp_rules=[(f,s,b) for f in comps for s,b in rules(open(f).read())]
    # index by simple selector
    shell_by={}
    for s,b in shell_rules:
        for ss in simple(s): shell_by.setdefault(ss,[]).append((s,b))
    problems=[]; checked=0; cross=set()
    comp_by={}
    for f,s,b in comp_rules:
        for ss in simple(s): comp_by.setdefault(ss,set()).add(f)
        for ss in simple(s):
            for (sh_s,sh_b) in shell_by.get(ss,[]):
                oi_shell=opos.get((sh_s,sh_b)); oi_comp=opos.get((s,b))
                if oi_shell is None or oi_comp is None: continue
                if not (props(sh_b)&props(b)): continue   # 같은 속성을 다투지 않으면 순서 무관
                checked+=1
                if oi_shell>oi_comp: problems.append((ss,sh_s[:40],f.split('/')[-1]))
    cross=[ss for ss,fs in comp_by.items() if len(fs)>1]
    print(f"{app}: 셸↔컴포넌트 같은 단순선택자·같은 속성 쌍 {checked}개, 순서 뒤집힘(셸이 원본에서 뒤) {len(problems)}개, 컴포넌트 파일끼리 겹치는 단순선택자 {len(cross)}개")
    for p in problems[:15]: print("   REVERSED:",p)
    for c in cross[:15]: print("   cross:",c[:50], sorted(x.split('/')[-1] for x in comp_by[c]))
    total_problems+=len(problems)+len(cross)
sys.exit(1 if total_problems else 0)
