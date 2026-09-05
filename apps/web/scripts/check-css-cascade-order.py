"""CSS cascade 순서 검사 (wp-04 CSS 분할 회귀 방지, 리뷰 P0 재발 방지).

네 가지를 검사한다.
 1. 원본(단일 파일, commit f31cc27) 규칙 순서 대비 — 같은 단순선택자·같은 속성을 다투는 규칙 쌍에서 원본과 순서가
    뒤집힌 것이 없는지. 셸(styles/*.css)↔컴포넌트 옆 CSS 쌍과 같은 파일 안의 쌍을 본다. 컴포넌트 파일끼리 겹치는
    단순선택자도 잡는다(파일 사이 순서는 import 순서에 달려 보장할 수 없으므로).
 2. 진입점(main.tsx) import 순서 — 셸 CSS import가 컴포넌트를 끌어오는 첫 import보다 앞에 있는지(`import type`은 제외).
    (2026-09-05 P0 원인: 셸 CSS가 컴포넌트 CSS 뒤에 번들돼 테마·flex 규칙이 덮였다.)
 3. 빌드 산출물(dist/, dist-desktop/)이 있으면 번들 CSS에서 셸 규칙이 모든 컴포넌트 CSS 파일보다 앞에 있는지.
 4. 번들에서 과거 P0 선택자의 최종 선언이 기대값인지(.coin-chart-page 배경·색·하단 여백은 전용 규칙, .show-current-label은 flex),
    .chart-tool-strip의 media 조건(<=410px·>=860px, 방향·값 정확 비교)이 남아 있는지 — 3차 리뷰 P2: 위치 비교만으로는 같은 파일 안 재배치·값 변경을 못 잡았다.

실행: apps/web에서 `npm run check:css` (빌드 뒤에 돌리면 3·4번까지 검사). 문제가 있으면 exit 1.
"""
import glob
import os
import re
import subprocess
import sys

ORIGIN_COMMIT = 'f31cc27'
APPS = [
    dict(app='mobile', shell='src/app/mobile/styles/mobile.css', comp_glob='src/app/mobile/**/*.css',
         orig='apps/web/src/app/mobile/styles/mobile.css', entry='src/app/mobile/main.tsx', dist='dist',
         # (선택자, 속성, 기대: 값 또는 'ONLY_SELECTOR'(그 선택자 단독 규칙이 최종이어야 함))
         final=[('.coin-chart-page', 'background', 'ONLY_SELECTOR'), ('.coin-chart-page', 'color', 'ONLY_SELECTOR'),
                ('.coin-chart-page', 'padding-bottom', 'ONLY_SELECTOR'),
                ('.show-current-label', 'display', 'flex')],
         # (선택자, media 조건) — 조건은 '<=410px' 형태로 정규화해 정확히 비교한다(4차 리뷰 P2: 부분 문자열 비교는 1860px도 통과시켰다)
         media=[('.chart-tool-strip', '<=410px'), ('.chart-tool-strip', '>=860px')]),
    dict(app='desktop', shell='src/app/desktop/styles/desktop.css', comp_glob='src/app/desktop/**/*.css',
         orig='apps/web/src/app/desktop/styles/desktop.css', entry='src/app/desktop/main.tsx', dist='dist-desktop',
         final=[], media=[]),
]


def rules(css):
    """(media 조건, 선택자, 본문) 목록. @media 안의 규칙은 media 조건을 붙여 돌려주고 그 외 @규칙(keyframes 등)은 건너뛴다."""
    nc = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    out = []

    def walk(text, media):
        i = 0
        while True:
            j = text.find('{', i)
            if j < 0:
                break
            sel = ' '.join(text[i:j].split()).lstrip('} ').strip()
            d = 1
            k = j + 1
            while d and k < len(text):
                d += text[k] == '{'
                d -= text[k] == '}'
                k += 1
            inner = text[j + 1:k - 1]
            if sel.startswith('@media'):
                walk(inner, sel)
            elif sel.startswith('@'):
                pass  # keyframes·font-face·supports 등은 순서 검사 대상 아님
            elif sel:
                out.append((media, sel, ' '.join(inner.split())))
            i = k

    walk(nc, '')
    return out


def simple(sel):
    return [s.strip() for s in sel.split(',') if s.strip()]


def props(body):
    return set(p.split(':')[0].strip() for p in body.split(';') if ':' in p)


def prop_value(body, prop):
    v = None
    for p in body.split(';'):
        if ':' in p and p.split(':')[0].strip() == prop:
            v = p.split(':', 1)[1].strip()
    return v


def minified(sel):
    """번들(esbuild minify)에서 선택자가 놓이는 형태로 정규화 — 콤마·결합자 주변 공백 제거."""
    return re.sub(r'\s*([,>+~])\s*', r'\1', ' '.join(sel.split()))


def check_origin_order(cfg, shell_rules, comp_rules):
    proc = subprocess.run(['git', 'show', f'{ORIGIN_COMMIT}:{cfg["orig"]}'], capture_output=True, text=True, cwd='../..')
    if proc.returncode != 0 or not proc.stdout:
        return [f'원본 commit {ORIGIN_COMMIT}을 읽을 수 없다(shallow clone?) — fetch-depth를 0으로']
    opos = {}
    for i, (m, s, b) in enumerate(rules(proc.stdout)):
        opos.setdefault((s, b), i)

    def competing(a, b):
        return bool(set(simple(a[0])) & set(simple(b[0]))) and bool(props(a[1]) & props(b[1]))

    problems = []
    checked = 0
    # (a) 셸 ↔ 컴포넌트: 현재는 셸이 먼저 번들되므로 원본에서 셸 규칙이 뒤였던 쌍은 뒤집힘
    for f, s, b in comp_rules:
        for (sh_s, sh_b) in shell_rules:
            if not competing((sh_s, sh_b), (s, b)):
                continue
            oi_shell, oi_comp = opos.get((sh_s, sh_b)), opos.get((s, b))
            if oi_shell is None or oi_comp is None:
                continue
            checked += 1
            if oi_shell > oi_comp:
                problems.append(f'REVERSED 셸 "{sh_s[:40]}" 이 원본에서 {os.path.basename(f)} "{s[:40]}" 규칙보다 뒤')
    # (b) 같은 파일 안: 파일 순서가 곧 번들 순서 — 원본과 상대 순서가 뒤집히면 문제
    by_file = {}
    for f, s, b in comp_rules:
        by_file.setdefault(f, []).append((s, b))
    by_file[cfg['shell']] = list(shell_rules)
    for f, rs in by_file.items():
        for i in range(len(rs)):
            for j in range(i + 1, len(rs)):
                if not competing(rs[i], rs[j]):
                    continue
                oi, oj = opos.get(rs[i]), opos.get(rs[j])
                if oi is None or oj is None:
                    continue
                checked += 1
                if oi > oj:
                    problems.append(f'REVERSED(같은 파일 {os.path.basename(f)}) "{rs[i][0][:40]}" ↔ "{rs[j][0][:40]}" 순서가 원본과 반대')
    # (c) 컴포넌트 파일끼리 같은 단순선택자
    comp_by = {}
    for f, s, b in comp_rules:
        for ss in simple(s):
            comp_by.setdefault(ss, set()).add(f)
    for ss, fs in comp_by.items():
        if len(fs) > 1:
            problems.append(f'CROSS {ss[:50]} — 컴포넌트 파일 여러 개가 같은 단순선택자: {sorted(os.path.basename(x) for x in fs)}')
    print(f'  [1] 원본 순서: 경쟁 쌍 {checked}개 검사, 문제 {len(problems)}개')
    return problems


def check_entry_import_order(cfg):
    src = open(cfg['entry'], encoding='utf-8').read()
    imports = [(m.start(), m.group(1), m.group(2)) for m in
               re.finditer(r'^import\b(\s+type\b)?[^\n]*?[\'"]([^\'"]+)[\'"]', src, flags=re.M)]
    shell_name = os.path.basename(cfg['shell'])
    shell_pos = next((pos for pos, _t, spec in imports if spec.endswith(shell_name)), None)
    if shell_pos is None:
        return [f'{cfg["entry"]}: 셸 CSS({shell_name}) import가 없다']
    # 상대 경로 import 중 CSS도 아니고 타입 전용도 아닌 것(컴포넌트·앱)이 셸 CSS보다 앞에 오면 그 컴포넌트의 CSS가 먼저 번들된다.
    early = [spec for pos, t, spec in imports
             if pos < shell_pos and spec.startswith('.') and not spec.endswith('.css') and not t]
    print(f'  [2] 진입점 import 순서: 셸 CSS 앞의 컴포넌트 import {len(early)}개')
    return [f'{cfg["entry"]}: 셸 CSS보다 앞에 컴포넌트 import "{e}"' for e in early]


def load_bundle(cfg):
    css_files = glob.glob(os.path.join(cfg['dist'], 'assets', '*.css'))
    if not css_files:
        return None
    return ''.join(open(f, encoding='utf-8').read() for f in sorted(css_files))


def check_bundle_order(cfg, bundle, shell_rules, comp_files):
    shell_sel = next((s for s, b in shell_rules if not s.startswith(':root')), None)
    shell_idx = bundle.find(minified(shell_sel) + '{') if shell_sel else -1
    problems = []
    if shell_idx < 0:
        return [f'번들에서 셸 첫 규칙 "{shell_sel}"을 찾지 못했다']
    for f in comp_files:
        rs = rules(open(f, encoding='utf-8').read())
        if not rs:
            continue
        idx = bundle.find(minified(rs[0][1]) + '{')
        if idx < 0:
            problems.append(f'번들에서 {os.path.basename(f)} 첫 규칙 "{rs[0][1][:40]}"을 찾지 못했다')
        elif idx < shell_idx:
            problems.append(f'BUNDLE {os.path.basename(f)} 규칙이 번들에서 셸 규칙보다 앞에 있다')
    print(f'  [3] 번들 순서: 컴포넌트 CSS {len(comp_files)}개 대비 셸 선행 검사, 문제 {len(problems)}개')
    return problems


def media_conditions(media):
    """'@media (width<=410px)'·'@media (max-width: 410px)' → {'<=410px'}. 방향·경계값을 정확히 비교하기 위한 정규화."""
    m = media.replace(' ', '')
    out = set()
    for mo in re.finditer(r'\(width([<>]=?)(\d+(?:\.\d+)?[a-z]+)\)', m):
        out.add(mo.group(1) + mo.group(2))
    for mo in re.finditer(r'\(min-width:(\d+(?:\.\d+)?[a-z]+)\)', m):
        out.add('>=' + mo.group(1))
    for mo in re.finditer(r'\(max-width:(\d+(?:\.\d+)?[a-z]+)\)', m):
        out.add('<=' + mo.group(1))
    return out


def check_bundle_final(cfg, bundle):
    if not cfg['final'] and not cfg['media']:
        print('  [4] 번들 최종 선언: 검사 항목 없음')
        return []
    rs = rules(bundle)
    problems = []
    for sel, prop, expect in cfg['final']:
        last = None
        for media, s, b in rs:
            if media:
                continue  # media 안 규칙은 조건부라 최종값 판단에서 제외
            if sel in simple(s) and prop in props(b):
                last = (s, prop_value(b, prop))
        if last is None:
            problems.append(f'FINAL {sel} {prop}: 번들에 선언이 없다')
        elif expect == 'ONLY_SELECTOR' and simple(last[0]) != [sel]:
            problems.append(f'FINAL {sel} {prop}: 최종 선언이 전용 규칙이 아니라 "{last[0][:40]}" (값 {last[1]})')
        elif expect != 'ONLY_SELECTOR' and last[1] != expect:
            problems.append(f'FINAL {sel} {prop}: 최종값 {last[1]} (기대 {expect})')
    for sel, cond in cfg['media']:
        if not any(media and cond in media_conditions(media) and sel in simple(s) for media, s, b in rs):
            problems.append(f'MEDIA {sel}: {cond} 조건의 규칙이 번들에 없다')
    print(f'  [4] 번들 최종 선언·media: {len(cfg["final"])}+{len(cfg["media"])}개 검사, 문제 {len(problems)}개')
    return problems


def main():
    total = 0
    for cfg in APPS:
        print(f'{cfg["app"]}:')
        shell_rules = [(s, b) for m, s, b in rules(open(cfg['shell'], encoding='utf-8').read())]
        comp_files = [f for f in glob.glob(cfg['comp_glob'], recursive=True)
                      if os.path.abspath(f) != os.path.abspath(cfg['shell'])]
        comp_rules = [(f, s, b) for f in comp_files for m, s, b in rules(open(f, encoding='utf-8').read())]
        problems = check_origin_order(cfg, shell_rules, comp_rules)
        problems += check_entry_import_order(cfg)
        bundle = load_bundle(cfg)
        if bundle is None:
            print(f'  [3][4] 번들 검사: {cfg["dist"]}/assets/*.css 없음 — 건너뜀(빌드 뒤 다시 실행하면 검사)')
        else:
            problems += check_bundle_order(cfg, bundle, shell_rules, comp_files)
            problems += check_bundle_final(cfg, bundle)
        for p in problems[:20]:
            print('   !!', p)
        total += len(problems)
    sys.exit(1 if total else 0)


if __name__ == '__main__':
    main()
