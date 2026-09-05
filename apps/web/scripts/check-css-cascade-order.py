"""CSS cascade 순서 검사 (wp-04 CSS 분할 회귀 방지, 리뷰 P0 재발 방지).

세 가지를 검사한다.
 1. 원본(단일 파일, commit f31cc27) 규칙 순서 대비 — 셸(styles/*.css)과 컴포넌트 옆 CSS가 같은 단순선택자·같은 속성을
    다투는 쌍에서 원본과 순서가 뒤집힌 것이 없는지, 컴포넌트 파일끼리 겹치는 단순선택자가 없는지.
 2. 진입점(main.tsx) import 순서 — 셸 CSS import가 컴포넌트를 끌어오는 첫 import보다 앞에 있는지.
    (2026-09-05 P0 원인: 셸 CSS가 컴포넌트 CSS 뒤에 번들돼 테마·flex 규칙이 덮였다.)
 3. 빌드 산출물(dist/, dist-desktop/)이 있으면 번들 CSS에서 셸 규칙이 모든 컴포넌트 CSS 파일보다 앞에 있는지.

실행: apps/web에서 `npm run check:css` (빌드 뒤에 돌리면 3번까지 검사). 문제가 있으면 exit 1.
"""
import glob
import os
import re
import subprocess
import sys

ORIGIN_COMMIT = 'f31cc27'
APPS = [
    dict(app='mobile', shell='src/app/mobile/styles/mobile.css', comp_glob='src/app/mobile/**/*.css',
         orig='apps/web/src/app/mobile/styles/mobile.css', entry='src/app/mobile/main.tsx', dist='dist'),
    dict(app='desktop', shell='src/app/desktop/styles/desktop.css', comp_glob='src/app/desktop/**/*.css',
         orig='apps/web/src/app/desktop/styles/desktop.css', entry='src/app/desktop/main.tsx', dist='dist-desktop'),
]


def rules(css):
    nc = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    out = []
    i = 0
    while True:
        j = nc.find('{', i)
        if j < 0:
            break
        sel = ' '.join(nc[i:j].split()).lstrip('} ').strip()
        if sel.startswith('@'):
            i = j + 1
            continue
        d = 1
        k = j + 1
        while d and k < len(nc):
            d += nc[k] == '{'
            d -= nc[k] == '}'
            k += 1
        if sel:
            out.append((sel, ' '.join(nc[j + 1:k - 1].split())))
        i = k
    return out


def simple(sel):
    return [s.strip() for s in sel.split(',') if s.strip()]


def props(body):
    return set(p.split(':')[0].strip() for p in body.split(';') if ':' in p)


def minified(sel):
    """번들(esbuild minify)에서 선택자가 놓이는 형태로 정규화 — 콤마·결합자 주변 공백 제거."""
    return re.sub(r'\s*([,>+~])\s*', r'\1', ' '.join(sel.split()))


def check_origin_order(cfg, shell_rules, comp_rules):
    proc = subprocess.run(['git', 'show', f'{ORIGIN_COMMIT}:{cfg["orig"]}'], capture_output=True, text=True, cwd='../..')
    if proc.returncode != 0 or not proc.stdout:
        return [f'원본 commit {ORIGIN_COMMIT}을 읽을 수 없다(shallow clone?) — fetch-depth를 0으로']
    opos = {}
    for i, (s, b) in enumerate(rules(proc.stdout)):
        opos.setdefault((s, b), i)
    shell_by = {}
    for s, b in shell_rules:
        for ss in simple(s):
            shell_by.setdefault(ss, []).append((s, b))
    problems = []
    checked = 0
    comp_by = {}
    for f, s, b in comp_rules:
        for ss in simple(s):
            comp_by.setdefault(ss, set()).add(f)
            for (sh_s, sh_b) in shell_by.get(ss, []):
                oi_shell = opos.get((sh_s, sh_b))
                oi_comp = opos.get((s, b))
                if oi_shell is None or oi_comp is None:
                    continue
                if not (props(sh_b) & props(b)):
                    continue  # 같은 속성을 다투지 않으면 순서 무관
                checked += 1
                if oi_shell > oi_comp:
                    problems.append(f'REVERSED {ss} — 셸 "{sh_s[:40]}" 이 원본에서 {os.path.basename(f)} 규칙보다 뒤')
    cross = [ss for ss, fs in comp_by.items() if len(fs) > 1]
    for c in cross:
        problems.append(f'CROSS {c[:50]} — 컴포넌트 파일 여러 개가 같은 단순선택자: {sorted(os.path.basename(x) for x in comp_by[c])}')
    print(f'  [1] 원본 순서: 셸↔컴포넌트 경쟁 쌍 {checked}개 검사, 문제 {len(problems)}개')
    return problems


def check_entry_import_order(cfg):
    src = open(cfg['entry'], encoding='utf-8').read()
    imports = [(m.start(), m.group(1)) for m in re.finditer(r'^import\b[^\n]*?[\'"]([^\'"]+)[\'"]', src, flags=re.M)]
    shell_name = os.path.basename(cfg['shell'])
    shell_pos = next((pos for pos, spec in imports if spec.endswith(shell_name)), None)
    if shell_pos is None:
        return [f'{cfg["entry"]}: 셸 CSS({shell_name}) import가 없다']
    # 상대 경로 import 중 CSS가 아닌 것(컴포넌트·앱)이 셸 CSS보다 앞에 오면 그 컴포넌트의 CSS가 먼저 번들된다.
    early = [spec for pos, spec in imports if pos < shell_pos and spec.startswith('.') and not spec.endswith('.css')]
    print(f'  [2] 진입점 import 순서: 셸 CSS 앞의 컴포넌트 import {len(early)}개')
    return [f'{cfg["entry"]}: 셸 CSS보다 앞에 컴포넌트 import "{e}"' for e in early]


def check_bundle_order(cfg, shell_rules, comp_files):
    css_files = glob.glob(os.path.join(cfg['dist'], 'assets', '*.css'))
    if not css_files:
        print(f'  [3] 번들 순서: {cfg["dist"]}/assets/*.css 없음 — 건너뜀(빌드 뒤 다시 실행하면 검사)')
        return []
    bundle = ''.join(open(f, encoding='utf-8').read() for f in sorted(css_files))
    shell_sel = next((s for s, b in shell_rules if not s.startswith(':root')), None)
    shell_idx = bundle.find(minified(shell_sel) + '{') if shell_sel else -1
    problems = []
    if shell_idx < 0:
        return [f'번들에서 셸 첫 규칙 "{shell_sel}"을 찾지 못했다']
    for f in comp_files:
        rs = rules(open(f, encoding='utf-8').read())
        if not rs:
            continue
        idx = bundle.find(minified(rs[0][0]) + '{')
        if idx < 0:
            problems.append(f'번들에서 {os.path.basename(f)} 첫 규칙 "{rs[0][0][:40]}"을 찾지 못했다')
        elif idx < shell_idx:
            problems.append(f'BUNDLE {os.path.basename(f)} 규칙이 번들에서 셸 규칙보다 앞에 있다')
    print(f'  [3] 번들 순서: 컴포넌트 CSS {len(comp_files)}개 대비 셸 선행 검사, 문제 {len(problems)}개')
    return problems


def main():
    total = 0
    for cfg in APPS:
        print(f'{cfg["app"]}:')
        shell_rules = rules(open(cfg['shell'], encoding='utf-8').read())
        comp_files = [f for f in glob.glob(cfg['comp_glob'], recursive=True)
                      if os.path.abspath(f) != os.path.abspath(cfg['shell'])]
        comp_rules = [(f, s, b) for f in comp_files for s, b in rules(open(f, encoding='utf-8').read())]
        problems = check_origin_order(cfg, shell_rules, comp_rules)
        problems += check_entry_import_order(cfg)
        problems += check_bundle_order(cfg, shell_rules, comp_files)
        for p in problems[:20]:
            print('   !!', p)
        total += len(problems)
    sys.exit(1 if total else 0)


if __name__ == '__main__':
    main()
