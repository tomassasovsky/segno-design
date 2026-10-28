import colorsys, math

def shade(hexc, dl=0.0, ds=0.0):
    r, g, b = (int(hexc[i:i+2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = min(1, max(0, l + dl)); s = min(1, max(0, s + ds))
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return '#%02x%02x%02x' % (round(r*255), round(g*255), round(b*255))

def knob(cx, cy, r, angle, label, uid):
    ridges = []
    for i in range(60):
        a = math.radians(i * 6)
        x1, y1 = cx + (r-6)*math.cos(a), cy + (r-6)*math.sin(a)
        x2, y2 = cx + (r-0.5)*math.cos(a), cy + (r-0.5)*math.sin(a)
        ridges.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')
    a = math.radians(angle - 90)
    ix1, iy1 = cx + (r*0.18)*math.cos(a), cy + (r*0.18)*math.sin(a)
    ix2, iy2 = cx + (r*0.66)*math.cos(a), cy + (r*0.66)*math.sin(a)
    return f'''<g>
 <ellipse cx="{cx}" cy="{cy+r*0.32:.1f}" rx="{r*1.02:.1f}" ry="{r*0.98:.1f}" fill="#000" opacity=".38" filter="url(#soft)"/>
 <circle cx="{cx}" cy="{cy+3}" r="{r}" fill="#0b0c0e"/>
 <circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#skirt)"/>
 <g stroke="#000" stroke-opacity=".55" stroke-width="1.6">{''.join(ridges)}</g>
 <circle cx="{cx}" cy="{cy}" r="{r*0.74:.1f}" fill="url(#cap)"/>
 <circle cx="{cx}" cy="{cy}" r="{r*0.74:.1f}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="1.2"/>
 <ellipse cx="{cx - r*0.22:.1f}" cy="{cy - r*0.3:.1f}" rx="{r*0.36:.1f}" ry="{r*0.2:.1f}" fill="#fff" opacity=".10"/>
 <line x1="{ix1:.1f}" y1="{iy1:.1f}" x2="{ix2:.1f}" y2="{iy2:.1f}" stroke="#f4f6f8" stroke-width="{max(3, r*0.11):.1f}" stroke-linecap="round"/>
 <text x="{cx}" y="{cy + r + 30:.1f}" text-anchor="middle" class="kl">{label}</text>
</g>'''

def screw(x, y):
    return f'''<g><circle cx="{x}" cy="{y}" r="7.5" fill="#000" opacity=".25"/><circle cx="{x}" cy="{y-0.5}" r="6.5" fill="url(#metal)"/>
 <line x1="{x-4}" y1="{y+2}" x2="{x+4}" y2="{y-3}" stroke="#55595f" stroke-width="1.8" stroke-linecap="round"/></g>'''

def jack(x, side):
    sx = -1 if side == 'l' else 1
    body = f'<rect x="{x if side=="l" else x-18}" y="96" width="18" height="44" rx="3" fill="url(#metalv)"/>'
    nut = f'<rect x="{x - 8 if side=="l" else x-2}" y="104" width="10" height="28" rx="2" fill="#2a2d32"/>'
    return body + nut

def pedal(name, sub, base, labels, angles):
    W, H = 450, 662
    hi, mid, lo, deep = shade(base, .10), base, shade(base, -.10), shade(base, -.20)
    n = len(labels)
    r = {1: 44, 2: 42, 3: 36, 4: 31}[n]
    xs = {1: [225], 2: [138, 312], 3: [104, 225, 346], 4: [88, 179, 271, 362]}[n]
    knobs = ''.join(knob(x, 136, r, a, l, i) for i, (x, l, a) in enumerate(zip(xs, labels, angles)))
    size = 74 if len(name) <= 5 else (64 if len(name) <= 6 else (56 if len(name) <= 7 else 48))
    ribs = ''.join(f'<rect x="{x}" y="{y}" width="26" height="7" rx="3.5"/>'
                   for row, y in enumerate(range(452, 600, 15))
                   for x in range(80 + (row % 2) * 15, 362, 30)
                   if (x + 13 - 225) ** 2 + (y + 3.5 - 521) ** 2 > 54 ** 2)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">
<defs>
 <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{hi}"/><stop offset=".55" stop-color="{mid}"/><stop offset="1" stop-color="{lo}"/></linearGradient>
 <linearGradient id="tread" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{mid}"/><stop offset="1" stop-color="{deep}"/></linearGradient>
 <linearGradient id="side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".08" stop-color="#000" stop-opacity="0"/><stop offset=".92" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>
 <radialGradient id="sheen" cx=".28" cy=".08" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
 <radialGradient id="skirt" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#3b4048"/><stop offset="1" stop-color="#121418"/></radialGradient>
 <radialGradient id="cap" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#4d535d"/><stop offset=".6" stop-color="#262a30"/><stop offset="1" stop-color="#16181c"/></radialGradient>
 <radialGradient id="metal" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f2f4f6"/><stop offset=".6" stop-color="#a7adb5"/><stop offset="1" stop-color="#6c727a"/></radialGradient>
 <linearGradient id="metalv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dde2"/><stop offset=".5" stop-color="#8c9299"/><stop offset="1" stop-color="#5d636a"/></linearGradient>
 <radialGradient id="lens" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffd2c8"/><stop offset=".45" stop-color="#ff4a3a"/><stop offset="1" stop-color="#8a130b"/></radialGradient>
 <linearGradient id="rubber" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16181c"/><stop offset=".12" stop-color="#23262c"/><stop offset="1" stop-color="#1b1d22"/></linearGradient>
 <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
 <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5"/></filter>
 <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
 <filter id="print" x="-5%" y="-20%" width="110%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="0.6" flood-color="#000" flood-opacity=".35"/></filter>
 <clipPath id="clipBody"><rect x="24" y="14" width="402" height="626" rx="30"/></clipPath>
 <style>.kl{{font:700 15px Inter,Helvetica,Arial,sans-serif;letter-spacing:1.5px;fill:#fff;fill-opacity:.88}}</style>
</defs>
<ellipse cx="225" cy="648" rx="200" ry="14" fill="#000" opacity=".35" filter="url(#soft)"/>
{jack(24, 'l')}{jack(426, 'r')}
<rect x="24" y="14" width="402" height="626" rx="30" fill="url(#body)"/>
<g clip-path="url(#clipBody)">
 <rect x="24" y="14" width="402" height="626" fill="url(#side)"/>
 <rect x="24" y="14" width="402" height="626" fill="url(#sheen)"/>
 <rect x="24" y="14" width="402" height="626" fill="#fff" filter="url(#grain)"/>
</g>
<rect x="25.5" y="15.5" width="399" height="623" rx="29" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>
{screw(52, 44)}{screw(398, 44)}
<circle cx="225" cy="52" r="16" fill="#ff3b2b" opacity=".55" filter="url(#glow)"/>
<circle cx="225" cy="52" r="10" fill="url(#metal)"/>
<circle cx="225" cy="52" r="7" fill="url(#lens)"/>
<circle cx="222.5" cy="49.5" r="2" fill="#fff" opacity=".8"/>
<text x="225" y="84" text-anchor="middle" class="kl" style="font-size:11px">CHECK</text>
{knobs}
<rect x="30" y="292" width="390" height="8" rx="4" fill="#000" opacity=".45"/>
<rect x="32" y="298" width="386" height="334" rx="22" fill="url(#tread)"/>
<rect x="32" y="298" width="386" height="334" rx="22" fill="url(#sheen)" opacity=".5"/>
<rect x="33" y="299" width="384" height="332" rx="21" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2"/>
<g filter="url(#print)">
 <text x="225" y="{372 if sub else 384}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="900" font-size="{size}" letter-spacing="2" fill="#f6f8fa">{name}</text>
 <text x="225" y="404" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="600" font-size="17" letter-spacing="3" fill="#fff" fill-opacity=".8">{sub}</text>
</g>
<rect x="58" y="428" width="334" height="186" rx="16" fill="#0d0e10"/>
<rect x="62" y="432" width="326" height="178" rx="13" fill="url(#rubber)"/>
<g fill="#2c3037">{ribs}</g>
<rect x="62" y="432" width="326" height="178" rx="13" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="3"/>
<circle cx="225" cy="523" r="47" fill="#000" opacity=".5" filter="url(#soft)"/>
<circle cx="225" cy="521" r="45" fill="#0d0e10"/>
<circle cx="225" cy="521" r="41" fill="url(#metal)"/>
<circle cx="225" cy="521" r="41" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>
<g transform="translate(225 521) scale(1.25)" fill="none" stroke-linecap="round" stroke-width="5">
 <g stroke="#ffffff" stroke-opacity=".55" transform="translate(0 1.2)"><path d="M10 -18 C0 -26 -16 -20 -12 -8 C-8 2 12 0 12 12 C12 24 -6 26 -12 18"/><line x1="-20" y1="20" x2="20" y2="-20"/></g>
 <g stroke="#2a2e34"><path d="M10 -18 C0 -26 -16 -20 -12 -8 C-8 2 12 0 12 12 C12 24 -6 26 -12 18"/><line x1="-20" y1="20" x2="20" y2="-20"/></g>
 <circle cx="-16" cy="-4" r="2.6" fill="#2a2e34" stroke="none"/><circle cx="16" cy="4" r="2.6" fill="#2a2e34" stroke="none"/>
</g>
<rect x="24" y="626" width="402" height="14" rx="6" fill="#000" opacity=".3"/>
</svg>'''

SAMPLES = [
    ("DELAY", "DIGITAL DELAY", "#1fa3b0", ["LEVEL", "F.BACK", "TIME"], [40, -30, 70]),
    ("REVERB", "HALL / ROOM", "#6b4fc4", ["LEVEL", "TONE", "DECAY"], [10, -50, 90]),
    ("OCTAVER", "SUB OCTAVE", "#e07a24", ["BLEND"], [-20]),
    ("EQ", "4-BAND", "#4f9a3c", ["LOW", "MID", "HIGH", "LEVEL"], [-40, 20, 60, 0]),
]
if __name__ == "__main__":
    for name, sub, base, labels, angles in SAMPLES:
        open(f"pedal-{name.lower()}.svg", "w").write(pedal(name, sub, base, labels, angles))
