import json, sys, collections
R = json.load(open(sys.argv[1]))
mode = sys.argv[2] if len(sys.argv) > 2 else 'table'
styles = collections.OrderedDict()
for k, v in R.items():
    c = v['cfg']; s = c['page'].replace('.html', '') + ('#' + c['variant'] if c['variant'] else '')
    styles.setdefault(s, {}).setdefault(c['theme'], []).append(v)
for s, th in styles.items():
    row = [s]
    for t in ('light', 'dark'):
        vs = th.get(t, [])
        uniq = {}
        for v in vs:
            for f in v['fails']:
                key = (f['d'], f['t'])
                if key not in uniq or f['ratio'] < uniq[key]['ratio']: uniq[key] = f
        ntext = max([v['n_text'] for v in vs] or [0])
        sev = sum(1 for f in uniq.values() if f['ratio'] < 3)
        icons = len({(i['d'], i['t']) for v in vs for i in v['icon_fails']})
        ctrl = len({(i['d'], i['t']) for v in vs for i in v['ctrl_fails']})
        taps = [len(v['taps']) for v in vs if v['cfg']['w'] == 390]
        ntaps = [v['n_taps'] for v in vs if v['cfg']['w'] == 390]
        small = [len(v['small_text']) for v in vs if v['cfg']['w'] == 390]
        row.append(f"{t}: fail {len(uniq)}/{ntext} (<3:1 {sev}) icon {icons} ctrl {ctrl} taps<44 {taps[0] if taps else '-'}/{ntaps[0] if ntaps else '-'} small<12 {small[0] if small else '-'}")
        if mode == 'detail':
            print(f'## {s} {t}')
            for f in sorted(uniq.values(), key=lambda f: f['ratio'])[:int(sys.argv[3]) if len(sys.argv) > 3 else 12]:
                print('  ', f['ratio'], 'worst', f['worst'], 'pix', f['pix'], f['fg'], 'on', f['bg'], f"{f['fs']}px/{f['fw']}", 'op', f['o'], f['method'], '|', f['t'][:28], '|', f['d'][-55:], '| css', f['col'])
    if mode == 'table': print(' | '.join(row))
