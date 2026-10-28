"""Pedal faces v3: the five enclosure kinds, each pedal with its own character.

Per pedal: a face graphic that shows what the effect does, a display typeface
(all SIL OFL Google Fonts), a knob style, an LED colour and a body finish.
"""
import math, os, re, sys
from pedal_v2_reference import shade

FONTS = ['Bungee', 'Monoton', 'Righteous', 'Shrikhand', 'Pacifico', 'Bebas Neue', 'Audiowide', 'Rye',
         'Press Start 2P', 'Space Mono', 'Fascinate', 'Rubik Mono One', 'Bungee Shade', 'Lobster']

SEGNO = ('<path d="M10 -18 C0 -26 -16 -20 -12 -8 C-8 2 12 0 12 12 C12 24 -6 26 -12 18"/>'
         '<line x1="-20" y1="20" x2="20" y2="-20"/>')

DEFS = '''
 <radialGradient id="skirt" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#3b4048"/><stop offset="1" stop-color="#121418"/></radialGradient>
 <radialGradient id="cap" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#4d535d"/><stop offset=".6" stop-color="#262a30"/><stop offset="1" stop-color="#16181c"/></radialGradient>
 <radialGradient id="metal" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f2f4f6"/><stop offset=".6" stop-color="#a7adb5"/><stop offset="1" stop-color="#6c727a"/></radialGradient>
 <radialGradient id="dome" cx=".36" cy=".28" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#d4d8dd"/><stop offset=".8" stop-color="#8e949c"/><stop offset="1" stop-color="#5f656d"/></radialGradient>
 <radialGradient id="cream" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#fffaf0"/><stop offset=".55" stop-color="#eadfc6"/><stop offset="1" stop-color="#a99a7c"/></radialGradient>
 <linearGradient id="rubber" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16181c"/><stop offset=".12" stop-color="#23262c"/><stop offset="1" stop-color="#1b1d22"/></linearGradient>
 <linearGradient id="metalv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dde2"/><stop offset=".5" stop-color="#8c9299"/><stop offset="1" stop-color="#5d636a"/></linearGradient>
 <linearGradient id="side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".08" stop-color="#000" stop-opacity="0"/><stop offset=".92" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>
 <radialGradient id="sheen" cx=".28" cy=".08" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
 <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
 <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5"/></filter>
 <filter id="neon" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
 <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
 <filter id="flake"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="11"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 9 -7.6"/><feComposite in2="SourceGraphic" operator="in"/></filter>
 <filter id="hammer"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="3" seed="5"/><feDiffuseLighting lighting-color="#fff" surfaceScale="2.2"><feDistantLight azimuth="235" elevation="55"/></feDiffuseLighting><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.6 0 0 0 .62"/><feComposite in2="SourceGraphic" operator="in"/></filter>
 <filter id="marble"><feTurbulence type="turbulence" baseFrequency=".006 .012" numOctaves="4" seed="21"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -2.4 0 0 0 1.25"/><feComposite in2="SourceGraphic" operator="in"/></filter>
 <filter id="brush"><feTurbulence type="fractalNoise" baseFrequency=".004 .9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .10 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
 <filter id="print" x="-5%" y="-20%" width="110%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="0.6" flood-color="#000" flood-opacity=".35"/></filter>
'''


def ink(base):
    r, g, b = (int(base[i:i+2], 16) / 255 for i in (1, 3, 5))
    return '#16181c' if 0.299*r + 0.587*g + 0.114*b > 0.62 else '#f6f8fa'


def logo(x, y, s, colour, opacity=1):
    return (f'<g transform="translate({x} {y}) scale({s})" fill="none" stroke="{colour}" stroke-opacity="{opacity}" '
            f'stroke-linecap="round" stroke-width="5">{SEGNO}'
            f'<circle cx="-16" cy="-4" r="2.6" fill="{colour}" stroke="none"/><circle cx="16" cy="4" r="2.6" fill="{colour}" stroke="none"/></g>')


def led(x, y, colour='#ff3b2b'):
    lid = 'lens' + colour[1:]
    return (f'<radialGradient id="{lid}" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/>'
            f'<stop offset=".45" stop-color="{colour}"/><stop offset="1" stop-color="{shade(colour, -.25)}"/></radialGradient>'
            f'<circle cx="{x}" cy="{y}" r="15" fill="{colour}" opacity=".55" filter="url(#glow)"/>'
            f'<circle cx="{x}" cy="{y}" r="9" fill="url(#metal)"/><circle cx="{x}" cy="{y}" r="6" fill="url(#{lid})"/>'
            f'<circle cx="{x-2}" cy="{y-2}" r="1.8" fill="#fff" opacity=".8"/>')


def screw(x, y):
    return (f'<g><circle cx="{x}" cy="{y}" r="7.5" fill="#000" opacity=".25"/><circle cx="{x}" cy="{y-0.5}" r="6.5" fill="url(#metal)"/>'
            f'<line x1="{x-4}" y1="{y+2}" x2="{x+4}" y2="{y-3}" stroke="#55595f" stroke-width="1.8" stroke-linecap="round"/></g>')


# ---------- knobs ----------

def _pointer(cx, cy, r, angle, colour, w):
    a = math.radians(angle - 90)
    return (f'<line x1="{cx + r*.18*math.cos(a):.1f}" y1="{cy + r*.18*math.sin(a):.1f}" '
            f'x2="{cx + r*.8*math.cos(a):.1f}" y2="{cy + r*.8*math.sin(a):.1f}" stroke="{colour}" '
            f'stroke-width="{w:.1f}" stroke-linecap="round"/>')


def knob(style, cx, cy, r, angle, label, lc, accent='#f4f6f8'):
    shadow = f'<ellipse cx="{cx}" cy="{cy+r*.35:.1f}" rx="{r*1.05:.1f}" ry="{r:.1f}" fill="#000" opacity=".4" filter="url(#soft)"/>'
    if style == 'black':
        ridges = ''.join(
            f'<line x1="{cx + (r-6)*math.cos(math.radians(i*6)):.1f}" y1="{cy + (r-6)*math.sin(math.radians(i*6)):.1f}" '
            f'x2="{cx + (r-.5)*math.cos(math.radians(i*6)):.1f}" y2="{cy + (r-.5)*math.sin(math.radians(i*6)):.1f}"/>'
            for i in range(60))
        k = (f'<circle cx="{cx}" cy="{cy+3}" r="{r}" fill="#0b0c0e"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#skirt)"/>'
             f'<g stroke="#000" stroke-opacity=".55" stroke-width="1.6">{ridges}</g>'
             f'<circle cx="{cx}" cy="{cy}" r="{r*.74:.1f}" fill="url(#cap)"/>' + _pointer(cx, cy, r, angle, accent, max(3, r*.11)))
    elif style == 'dome':
        k = (f'<circle cx="{cx}" cy="{cy}" r="{r+3}" fill="#101114"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#dome)"/>'
             + _pointer(cx, cy, r, angle, '#1a1c20', max(3, r*.12)))
    elif style == 'cream':
        k = (f'<circle cx="{cx}" cy="{cy+3}" r="{r+4}" fill="#0b0c0e"/><circle cx="{cx}" cy="{cy}" r="{r+4}" fill="#1d1f23"/>'
             f'<circle cx="{cx}" cy="{cy}" r="{r*.8:.1f}" fill="url(#cream)"/>' + _pointer(cx, cy, r, angle, '#1a1c20', max(3, r*.1)))
    elif style == 'chicken':
        a = angle
        k = (f'<circle cx="{cx}" cy="{cy+3}" r="{r*.62:.1f}" fill="#0b0c0e"/>'
             f'<g transform="translate({cx} {cy}) rotate({a})">'
             f'<path d="M0 {-r*1.05:.1f} C{r*.32:.1f} {-r*.6:.1f} {r*.55:.1f} {r*.1:.1f} {r*.45:.1f} {r*.5:.1f} '
             f'C{r*.3:.1f} {r*.8:.1f} {-r*.3:.1f} {r*.8:.1f} {-r*.45:.1f} {r*.5:.1f} '
             f'C{-r*.55:.1f} {r*.1:.1f} {-r*.32:.1f} {-r*.6:.1f} 0 {-r*1.05:.1f}Z" fill="url(#cream)" stroke="#000" stroke-opacity=".4"/>'
             f'<line x1="0" y1="{-r*.95:.1f}" x2="0" y2="{-r*.35:.1f}" stroke="#1a1c20" stroke-width="3" stroke-linecap="round"/></g>')
    else:  # colour cap
        k = (f'<circle cx="{cx}" cy="{cy+3}" r="{r}" fill="#0b0c0e"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#skirt)"/>'
             f'<circle cx="{cx}" cy="{cy}" r="{r*.62:.1f}" fill="{style}"/>'
             f'<circle cx="{cx - r*.15:.1f}" cy="{cy - r*.2:.1f}" r="{r*.3:.1f}" fill="#fff" opacity=".25"/>'
             + _pointer(cx, cy, r, angle, '#f4f6f8', max(3, r*.1)))
    lab = (f'<text x="{cx}" y="{cy + r + 26:.1f}" text-anchor="middle" font-family="Inter, Helvetica, sans-serif" '
           f'font-weight="800" font-size="14" letter-spacing="1.5" fill="{lc}" fill-opacity=".9">{label}</text>') if label else ''
    return f'<g>{shadow}{k}{lab}</g>'


def stomp_switch(cx, cy, r=34):
    hexagon = ' '.join(f'{cx + (r+14)*math.cos(math.radians(30+60*i)):.1f},{cy + (r+14)*math.sin(math.radians(30+60*i)):.1f}' for i in range(6))
    return (f'<circle cx="{cx}" cy="{cy+6}" r="{r+16}" fill="#000" opacity=".35" filter="url(#soft)"/>'
            f'<polygon points="{hexagon}" fill="url(#metal)" stroke="#000" stroke-opacity=".35"/>'
            f'<circle cx="{cx}" cy="{cy+4}" r="{r}" fill="#3a3e44"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#dome)"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r*.62:.1f}" fill="none" stroke="#000" stroke-opacity=".15" stroke-width="2"/>')


# ---------- body and finishes ----------

def body(x, y, w, h, rx, base, finish, art, base2=None):
    hi, lo = shade(base, .10), shade(base, -.12)
    if finish == 'split' and base2:
        grad = (f'<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{shade(base, .08)}"/>'
                f'<stop offset=".5" stop-color="{base}"/><stop offset=".5" stop-color="{base2}"/><stop offset="1" stop-color="{shade(base2, -.1)}"/></linearGradient>')
    elif finish == 'fade' and base2:
        grad = (f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{base2}"/>'
                f'<stop offset="1" stop-color="{base}"/></linearGradient>')
    else:
        grad = (f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{hi}"/>'
                f'<stop offset=".55" stop-color="{base}"/><stop offset="1" stop-color="{lo}"/></linearGradient>')
    tex = {'flake': '<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff" filter="url(#flake)" opacity=".55"/>',
           'hammer': '<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff" filter="url(#hammer)" opacity=".5"/>',
           'marble': '<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff" filter="url(#marble)" opacity=".9"/>',
           'brush': '<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff" filter="url(#brush)"/>'}.get(finish, '')
    tex = tex.format(x=x, y=y, w=w, h=h)
    return f'''{grad}<clipPath id="cb"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/></clipPath>
<ellipse cx="{x + w/2}" cy="{y + h + 8}" rx="{w/2 - 20}" ry="14" fill="#000" opacity=".35" filter="url(#soft)"/>
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="url(#bg)"/>
<g clip-path="url(#cb)">{tex}{art}
 <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="url(#side)"/>
 <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="url(#sheen)"/>
 <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff" filter="url(#grain)"/>
</g>
<rect x="{x+1.5}" y="{y+1.5}" width="{w-3}" height="{h-3}" rx="{rx-1}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>'''


# ---------- face graphics: (x, y, w, h) region, colour c ----------

def wave(x0, x1, yc, amp, period, phase=0, step=4):
    pts = [f'{x:.1f},{yc + amp*math.sin((x - x0)/period*2*math.pi + phase):.1f}' for x in range(int(x0), int(x1)+1, step)]
    return 'M' + ' L'.join(pts)


def art_flames(x, y, w, h, c):
    out = []
    for i, (col, op) in enumerate([('#ff5a1f', .9), ('#ffb21f', .85), ('#fff1a8', .7)]):
        pts = [f'{x},{y+h}']
        n = 9
        for k in range(n + 1):
            px = x + w*k/n
            tip = y + h*(.15 + .25*i) + (k % 3)*h*.08
            pts.append(f'{px - w/n/2:.1f},{y + h*(.55 + .15*i):.1f}' if k else f'{px:.1f},{y+h*(.6+.15*i):.1f}')
            pts.append(f'{px:.1f},{tip:.1f}')
        pts.append(f'{x+w},{y+h}')
        out.append(f'<polygon points="{" ".join(pts)}" fill="{col}" opacity="{op}"/>')
    return ''.join(out)


def art_clip(x, y, w, h, c):
    yc = y + h/2
    pts = []
    for k in range(0, 9):
        px = x + w*k/8
        top = (k % 2 == 0)
        pts += [f'{px:.1f},{yc - h*.32 if top else yc + h*.32:.1f}', f'{px + w/16:.1f},{yc - h*.32 if top else yc + h*.32:.1f}']
    return (f'<polyline points="{" ".join(pts)}" fill="none" stroke="{c}" stroke-width="9" stroke-linejoin="miter" opacity=".9"/>'
            f'<path d="{wave(x, x+w, yc, h*.45, w/4, step=3)}" fill="none" stroke="{c}" stroke-width="3" stroke-dasharray="6 8" opacity=".5"/>')


def art_sines(x, y, w, h, c, cols=('#ffffff', '#c8ffe0', '#0b5a33')):
    return ''.join(f'<path d="{wave(x, x+w, y+h/2, h*.32, w/2.2, ph)}" fill="none" stroke="{col}" stroke-width="7" '
                   f'stroke-linecap="round" opacity=".75"/>' for ph, col in zip((0, 1.2, 2.4), cols))


def art_swirl(x, y, w, h, c):
    cx, cy = x + w/2, y + h/2
    pts = []
    for i in range(0, 900):
        t = i/900*6*math.pi
        r = 6 + t*h*.045
        pts.append(f'{cx + r*math.cos(t):.1f},{cy + r*math.sin(t)*.8:.1f}')
    return f'<polyline points="{" ".join(pts)}" fill="none" stroke="{c}" stroke-width="6" opacity=".45"/>'


def art_ripples(x, y, w, h, c):
    cx, cy = x + w/2, y + h*.55
    return ''.join(f'<ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{r*.42:.1f}" fill="none" stroke="{c}" stroke-width="{max(1.5, 7 - r/40):.1f}" '
                   f'opacity="{max(.08, .6 - r/500):.2f}"/>' for r in range(20, 420, 34))


def art_stars(x, y, w, h, c):
    import random
    rnd = random.Random(4)
    neb = (f'<radialGradient id="neb" cx=".65" cy=".4" r=".6"><stop offset="0" stop-color="#b56cff" stop-opacity=".55"/>'
           f'<stop offset=".5" stop-color="#3a6cff" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>'
           f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="url(#neb)"/>')
    stars = ''.join(f'<circle cx="{x + rnd.random()*w:.1f}" cy="{y + rnd.random()*h:.1f}" r="{rnd.choice([.8, 1.2, 1.6, 2.4]):.1f}" '
                    f'fill="#fff" opacity="{rnd.uniform(.4, 1):.2f}"/>' for _ in range(140))
    sparkle = ''.join(f'<path d="M{px} {py-10} L{px+2} {py-2} L{px+10} {py} L{px+2} {py+2} L{px} {py+10} L{px-2} {py+2} L{px-10} {py} L{px-2} {py-2}Z" fill="#fff"/>'
                      for px, py in [(x + w*.78, y + h*.22), (x + w*.18, y + h*.7), (x + w*.86, y + h*.8)])
    return neb + stars + sparkle


def art_octaves(x, y, w, h, c):
    cx, cy = x + w/2, y + h
    cols = ['#ff3d2e', '#ff7a1a', '#ffb31a', '#ffe14a', '#fff4b8']
    return ''.join(f'<circle cx="{cx}" cy="{cy}" r="{w*.75 - i*w*.13:.1f}" fill="{col}" opacity=".85"/>' for i, col in enumerate(cols))


def art_tweed(x, y, w, h, c):
    lines = ''.join(f'<line x1="{x + i}" y1="{y}" x2="{x + i - h}" y2="{y + h}" stroke="#5a3d12" stroke-width="3" opacity=".35"/>'
                    for i in range(0, int(w + h), 9))
    lines2 = ''.join(f'<line x1="{x + i}" y1="{y}" x2="{x + i + h}" y2="{y + h}" stroke="#fff3cf" stroke-width="2" opacity=".25"/>'
                     for i in range(-int(h), int(w), 9))
    return lines + lines2


def art_slices(x, y, w, h, c):
    return ''.join(f'<polygon points="{x + i},{y+h} {x + i + 40},{y+h} {x + i + 40 + h*.6:.1f},{y} {x + i + h*.6:.1f},{y}" fill="#16181c" opacity=".9"/>'
                   for i in range(-300, int(w), 90))


def art_echo(x, y, w, h, c, word, font):
    return ''.join(f'<text x="{x + w/2}" y="{y + 70 + i*58}" text-anchor="middle" font-family="&quot;{font}&quot;" font-size="64" '
                   f'fill="{c}" opacity="{.55 - i*.11:.2f}">{word}</text>' for i in range(5))


def art_reels(x, y, w, h, c):
    out = ''
    for cx in (x + w*.3, x + w*.7):
        cy = y + h/2
        out += f'<circle cx="{cx:.1f}" cy="{cy}" r="{h*.42:.1f}" fill="none" stroke="{c}" stroke-width="5" opacity=".55"/>'
        out += f'<circle cx="{cx:.1f}" cy="{cy}" r="{h*.12:.1f}" fill="{c}" opacity=".55"/>'
        out += ''.join(f'<circle cx="{cx + h*.26*math.cos(math.radians(a)):.1f}" cy="{cy + h*.26*math.sin(math.radians(a)):.1f}" r="{h*.08:.1f}" fill="none" stroke="{c}" stroke-width="4" opacity=".55"/>' for a in (90, 210, 330))
    out += f'<line x1="{x + w*.3:.1f}" y1="{y + h*.92:.1f}" x2="{x + w*.7:.1f}" y2="{y + h*.92:.1f}" stroke="{c}" stroke-width="4" opacity=".55"/>'
    return out


def art_spring(x, y, w, h, c):
    pts = []
    for i in range(0, 1200):
        t = i/1200
        px = x + w*.05 + t*w*.9 + math.cos(t*2*math.pi*16)*10
        py = y + h/2 + math.sin(t*2*math.pi*16)*h*.28
        pts.append(f'{px:.1f},{py:.1f}')
    return f'<polyline points="{" ".join(pts)}" fill="none" stroke="#e9c46a" stroke-width="4" opacity=".85"/>'


def art_gate(x, y, w, h, c):
    pts = [f'{x},{y + h*.8}']
    for k, (a, b) in enumerate([(.08, .3), (.38, .52), (.62, .9)]):
        pts += [f'{x + w*a:.1f},{y + h*.8:.1f}', f'{x + w*a:.1f},{y + h*.2:.1f}', f'{x + w*b:.1f},{y + h*.2:.1f}', f'{x + w*b:.1f},{y + h*.8:.1f}']
    pts.append(f'{x + w},{y + h*.8}')
    return f'<polyline points="{" ".join(pts)}" fill="none" stroke="{c}" stroke-width="8" stroke-linejoin="round" opacity=".85"/>'


def art_staff(x, y, w, h, c):
    lines = ''.join(f'<line x1="{x}" y1="{y + h*.2 + i*h*.15:.1f}" x2="{x + w}" y2="{y + h*.2 + i*h*.15:.1f}" stroke="{c}" stroke-width="2.5" opacity=".45"/>' for i in range(5))
    notes = ''
    for k, px in enumerate((x + w*.22, x + w*.5, x + w*.78)):
        for j, step in enumerate((0, 2, 4)):
            py = y + h*.8 - (step + k) * h*.075
            notes += f'<ellipse cx="{px:.1f}" cy="{py:.1f}" rx="13" ry="9.5" transform="rotate(-20 {px:.1f} {py:.1f})" fill="{c}" opacity=".7"/>'
        notes += f'<line x1="{px + 12:.1f}" y1="{y + h*.8 - (4 + k)*h*.075:.1f}" x2="{px + 12:.1f}" y2="{y + h*.8 - (4 + k)*h*.075 - h*.35:.1f}" stroke="{c}" stroke-width="3" opacity=".7"/>'
    return lines + notes


def art_tuner(x, y, w, h, c):
    cx, cy, r = x + w/2, y + h*.95, h*.8
    ticks = ''.join(f'<line x1="{cx + r*.82*math.cos(math.radians(a)):.1f}" y1="{cy + r*.82*math.sin(math.radians(a)):.1f}" '
                    f'x2="{cx + r*math.cos(math.radians(a)):.1f}" y2="{cy + r*math.sin(math.radians(a)):.1f}" '
                    f'stroke="{"#18a558" if a == -90 else c}" stroke-width="{6 if a == -90 else 3}" opacity=".8"/>' for a in range(-150, -29, 10))
    needle = f'<line x1="{cx}" y1="{cy}" x2="{cx + r*.9*math.cos(math.radians(-84)):.1f}" y2="{cy + r*.9*math.sin(math.radians(-84)):.1f}" stroke="#e8433a" stroke-width="4"/>'
    return ticks + needle


def art_marble(x, y, w, h, c):
    return ''


def art_arrows(x, y, w, h, c):
    out = ''
    for i, (dx, up) in enumerate(((.25, True), (.5, False), (.75, True))):
        px, py = x + w*dx, y + h/2
        s = -1 if up else 1
        out += (f'<path d="M{px - 26} {py - s*4} L{px} {py + s*-30} L{px + 26} {py - s*4} M{px} {py + s*-26} L{px} {py + s*34}" '
                f'fill="none" stroke="{c}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>')
    return out


def art_pump(x, y, w, h, c):
    path = f'M{x} {y + h*.8}'
    n = 4
    for k in range(n):
        x0 = x + w*k/n
        path += f' L{x0 + 2:.1f} {y + h*.85:.1f} C{x0 + w/n*.4:.1f} {y + h*.85:.1f} {x0 + w/n*.5:.1f} {y + h*.15:.1f} {x0 + w/n:.1f} {y + h*.15:.1f}'
    return f'<path d="{path}" fill="none" stroke="{c}" stroke-width="8" stroke-linejoin="round" opacity=".55"/>'


def art_spike(x, y, w, h, c):
    pts = []
    for i in range(0, 101):
        t = i/100
        env = math.exp(-((t - .3) * 9) ** 2) if t >= .3 else max(0, (t - .22)/.08)
        pts.append(f'{x + w*t:.1f},{y + h/2 - h*.45*env*math.sin(t*90):.1f}')
    return f'<polyline points="{" ".join(pts)}" fill="none" stroke="{c}" stroke-width="5" opacity=".6"/>'


def art_double(x, y, w, h, c):
    return ''.join(f'<circle cx="{x + w*.5 + dx}" cy="{y + h*.5}" r="{h*.38:.1f}" fill="none" stroke="{c}" stroke-width="7" opacity=".45"/>' for dx in (-30, 30))


def screen(x, y, w, h, inner):
    return (f'<rect x="{x-4}" y="{y-4}" width="{w+8}" height="{h+8}" rx="12" fill="#000" opacity=".5"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="#07090b"/>'
            f'<g opacity=".25" stroke="#3a4a40" stroke-width="1">' +
            ''.join(f'<line x1="{x}" y1="{y + k*h/5:.1f}" x2="{x+w}" y2="{y + k*h/5:.1f}"/>' for k in range(1, 5)) +
            ''.join(f'<line x1="{x + k*w/8:.1f}" y1="{y}" x2="{x + k*w/8:.1f}" y2="{y+h}"/>' for k in range(1, 8)) + '</g>'
            + f'<clipPath id="scr"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9"/></clipPath><g clip-path="url(#scr)">' + inner + '</g>' +
            f'<rect x="{x}" y="{y}" width="{w}" height="{h * .45:.1f}" rx="9" fill="#fff" opacity=".05"/>')


def disp_vu(x, y, w, h):
    cx, cy, r = x + w/2, y + h*1.05, h*.85
    arc = ''.join(f'<line x1="{cx + r*.85*math.cos(math.radians(a)):.1f}" y1="{cy + r*.85*math.sin(math.radians(a)):.1f}" '
                  f'x2="{cx + r*math.cos(math.radians(a)):.1f}" y2="{cy + r*math.sin(math.radians(a)):.1f}" '
                  f'stroke="{"#ff4a3a" if a > -60 else "#f3e7c4"}" stroke-width="3"/>' for a in range(-130, -49, 8))
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="#efe2bd"/>'
            f'<g transform="translate(0 0)">{arc.replace("#f3e7c4", "#2a2620")}</g>'
            f'<text x="{cx}" y="{y + h*.82:.1f}" text-anchor="middle" font-family="Bebas Neue" font-size="22" fill="#2a2620">VU</text>'
            f'<line x1="{cx}" y1="{cy}" x2="{cx + r*.95*math.cos(math.radians(-72)):.1f}" y2="{cy + r*.95*math.sin(math.radians(-72)):.1f}" stroke="#16181c" stroke-width="3"/>')


def disp_curve(x, y, w, h, kind, col):
    pts = []
    for i in range(0, 121):
        t = i/120
        if kind == 'eq4':
            v = .25*math.sin(t*math.pi*3.2 + .6) + .1*math.sin(t*14)
        elif kind == 'bell':
            v = .55*math.exp(-((t - .55)*7) ** 2) - .08
        elif kind == 'lpf':
            v = .05 + .35*math.exp(-((t - .6)*18) ** 2) if t < .6 else .4 - (t - .6)*3.2 + .0
            v = max(-.45, v)
        else:
            v = 0
        pts.append(f'{x + 10 + (w - 20)*t:.1f},{y + h/2 - v*h:.1f}')
    fill = f'<polygon points="{x + 10},{y + h} {" ".join(pts)} {x + w - 10},{y + h}" fill="{col}" opacity=".18"/>'
    return fill + f'<polyline points="{" ".join(pts)}" fill="none" stroke="{col}" stroke-width="4" filter="url(#neon)"/>'


def disp_record(x, y, w, h):
    cx, cy = x + w/2, y + h*.82
    return (f'<circle cx="{cx}" cy="{cy}" r="{w*.48:.1f}" fill="#0a0a0a"/>' +
            ''.join(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#3a3a3a" stroke-width="1.4"/>' for r in range(40, int(w*.48), 7)) +
            f'<circle cx="{cx}" cy="{cy}" r="34" fill="#e8433a"/><circle cx="{cx}" cy="{cy}" r="4" fill="#0a0a0a"/>'
            f'<path d="M{x + w*.15:.1f} {y + h*.35:.1f} Q{cx} {y + h*.05:.1f} {x + w*.85:.1f} {y + h*.35:.1f}" stroke="#fff" stroke-opacity=".18" stroke-width="10" fill="none"/>')


def disp_pixels(x, y, w, h, col):
    out = ''
    for i in range(16):
        t = i/15
        v = .5 + .42*math.sin(t*2*math.pi)
        hh = round(v*6)
        for j in range(hh):
            out += f'<rect x="{x + 12 + i*(w - 24)/16:.1f}" y="{y + h - 14 - j*(h - 24)/7:.1f}" width="{(w - 24)/16 - 3:.1f}" height="{(h - 24)/7 - 3:.1f}" fill="{col}" opacity="{.5 + j*.08:.2f}"/>'
    return out


# ---------- faces ----------

def svg(w, h, content):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><defs>{DEFS}</defs>{content}</svg>'


def title(x, y, name, font, size, colour, tilt=0, extra=''):
    t = f' transform="rotate({tilt} {x} {y})"' if tilt else ''
    return (f'<text x="{x}" y="{y}" text-anchor="middle" font-family="&quot;{font}&quot;" font-size="{size}" fill="{colour}" '
            f'filter="url(#print)"{t} {extra}>{name}</text>')


def place_knobs(n, cx, top, cols, dx, dy):
    rows = [list(range(i, min(n, i + cols))) for i in range(0, n, cols)]
    out = []
    for ri, row in enumerate(rows):
        for j, k in enumerate(row):
            out.append((k, cx - dx*(len(row) - 1)/2 + dx*j, top + dy*ri))
    return out


def treadle(p):
    W, H = 450, 662
    c = p['ink']
    n = len(p['labels'])
    r = {1: 44, 2: 42, 3: 36, 4: 31}[n]
    knobs = ''.join(knob(p['knob'], x, 136, r, p['angles'][k], p['labels'][k], c, p.get('accent', '#f4f6f8'))
                    for k, x, _ in place_knobs(n, 225, 136, 4, {1: 0, 2: 174, 3: 121, 4: 91}[n], 0))
    ribs = ''.join(f'<rect x="{x}" y="{y}" width="26" height="7" rx="3.5"/>'
                   for row, y in enumerate(range(452, 600, 15)) for x in range(80 + (row % 2) * 15, 362, 30)
                   if (x + 13 - 225) ** 2 + (y + 3.5 - 521) ** 2 > 54 ** 2)
    art = p['art'](24, 14, 402, 284)
    tart = p['tart'](32, 298, 386, 130) if p.get('tart') else ''
    tread_hi, tread_lo = p['base'], shade(p['base'], -.2)
    return svg(W, H, f'''<rect x="6" y="96" width="18" height="44" rx="3" fill="url(#metalv)"/><rect x="426" y="96" width="18" height="44" rx="3" fill="url(#metalv)"/>''' +
               body(24, 14, 402, 626, 30, p['base'], p['finish'], art, p.get('base2')) +
               screw(52, 44) + screw(398, 44) + led(225, 52, p['led']) + knobs +
               f'''<linearGradient id="tread" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{tread_hi}"/><stop offset="1" stop-color="{tread_lo}"/></linearGradient>
<rect x="30" y="292" width="390" height="8" rx="4" fill="#000" opacity=".45"/>
<rect x="32" y="298" width="386" height="334" rx="22" fill="url(#tread)"/>
<clipPath id="ct"><rect x="32" y="298" width="386" height="334" rx="22"/></clipPath><g clip-path="url(#ct)">{tart}</g>
<rect x="32" y="298" width="386" height="334" rx="22" fill="url(#sheen)" opacity=".5"/>
<rect x="33" y="299" width="384" height="332" rx="21" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2"/>''' +
               title(225, p.get('ty', 392), p['name'], p['font'], p['size'], c, p.get('tilt', 0), p.get('textx', '')) +
               f'''<rect x="58" y="428" width="334" height="186" rx="16" fill="#0d0e10"/>
<rect x="62" y="432" width="326" height="178" rx="13" fill="url(#rubber)"/><g fill="#2c3037">{ribs}</g>
<circle cx="225" cy="521" r="45" fill="#0d0e10"/><circle cx="225" cy="521" r="41" fill="url(#metal)"/>''' +
               logo(225, 521, 1.25, '#2a2e34') +
               '<rect x="24" y="626" width="402" height="14" rx="6" fill="#000" opacity=".3"/>')


def box(p):
    W, H = 450, 662
    c = p['ink']
    n = len(p['labels'])
    if n <= 3:
        spots = place_knobs(n, 225, 150, 3, 125, 0)
        r = {1: 42, 2: 40, 3: 34}[n]
    else:
        spots = place_knobs(n, 225, 128, 3 if n > 4 else 2, 125 if n > 4 else 170, 112)
        r = 30
    knobs = ''.join(knob(p['knob'], x, y, r, p['angles'][k], p['labels'][k], c) for k, x, y in spots)
    art = p['art'](30, 14, 390, 626)
    return svg(W, H, body(30, 14, 390, 626, 46, p['base'], p['finish'], art, p.get('base2')) +
               logo(225, 58, .7, c, .9) + led(345, 58, p['led']) + knobs +
               title(225, p.get('ty', 420 if n > 3 else 395), p['name'], p['font'], p['size'], c, p.get('tilt', 0), p.get('textx', '')) +
               stomp_switch(225, 548))


def window(p):
    W, H = 450, 760
    c, pc = p['ink'], ink(p['panel'])
    n = len(p['labels'])
    pts = {1: [(225, 200)], 2: [(160, 200), (290, 200)], 3: [(150, 160), (300, 160), (225, 270)],
           4: [(150, 160), (300, 160), (150, 285), (300, 285)]}[n]
    knobs = ''.join(knob(p['knob'], x, y, 36 if n <= 3 else 32, p['angles'][k], p['labels'][k], pc) for k, (x, y) in enumerate(pts))
    art = p['art'](66, 50, 318, 300)
    return svg(W, H, body(30, 14, 390, 724, 70, p['base'], p['finish'], '', p.get('base2')) +
               f'''<linearGradient id="pn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{shade(p['panel'], .08)}"/><stop offset="1" stop-color="{shade(p['panel'], -.08)}"/></linearGradient>
<rect x="70" y="56" width="310" height="300" rx="44" fill="#000" opacity=".35" filter="url(#soft)"/>
<rect x="66" y="50" width="318" height="300" rx="44" fill="url(#pn)"/>
<clipPath id="pclip"><rect x="66" y="50" width="318" height="300" rx="44"/></clipPath><g clip-path="url(#pclip)">{art}</g>
<rect x="67" y="51" width="316" height="298" rx="43" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
<rect x="66" y="50" width="318" height="300" rx="44" fill="url(#sheen)" opacity=".7"/>''' +
               logo(225, 80, .55, pc, .7) + knobs +
               title(225, p.get('ty', 470), p['name'], p['font'], p['size'], c, p.get('tilt', 0), p.get('textx', '')) +
               led(225, 525, p['led']) + stomp_switch(225, 632))


def module(p):
    W, H = 450, 1000
    c = p['ink']
    n = len(p['labels'])
    spots = place_knobs(n, 225, 400, 2, 180, 150)
    knobs = ''
    for k, x, y in spots:
        ticks = ''.join(
            f'<line x1="{x + 47*math.cos(math.radians(-225 + i*27)):.1f}" y1="{y + 47*math.sin(math.radians(-225 + i*27)):.1f}" '
            f'x2="{x + (56 if i % 5 == 0 else 52)*math.cos(math.radians(-225 + i*27)):.1f}" y2="{y + (56 if i % 5 == 0 else 52)*math.sin(math.radians(-225 + i*27)):.1f}"/>'
            for i in range(11))
        knobs += f'<g stroke="{c}" stroke-opacity=".75" stroke-width="2.2" stroke-linecap="round">{ticks}</g>'
        knobs += knob(p['knob'], x, y, 38, p['angles'][k], '', c)
        knobs += (f'<text x="{x}" y="{y + 82}" text-anchor="middle" font-family="Inter, Helvetica, sans-serif" font-weight="800" '
                  f'font-size="16" letter-spacing="1.5" fill="{c}" fill-opacity=".9">{p["labels"][k]}</text>')
    return svg(W, H, body(40, 14, 370, 970, 14, p['base'], p['finish'], '', p.get('base2')) +
               screw(72, 46) + screw(378, 46) + screw(72, 952) + screw(378, 952) +
               title(225, 122, p['name'], p['font'], p['size'], c, 0, p.get('textx', '')) +
               screen(80, 160, 290, 150, p['disp'](80, 160, 290, 150)) + knobs +
               led(225, 860, p['led']) +
               '<circle cx="225" cy="912" r="24" fill="#0d0e10"/><circle cx="225" cy="910" r="19" fill="url(#dome)"/>' +
               logo(345, 905, .55, c, .6))


def rocker(p):
    W, H = 450, 780
    c = p['ink']
    ribs = ''.join(f'<rect x="{x}" y="{y}" width="22" height="7" rx="3.5"/>'
                   for row, y in enumerate(range(70, 560, 16)) for x in range(78 + (row % 2) * 13, 300, 26))
    art = p['art'](322, 14, 98, 744)
    return svg(W, H, body(30, 14, 390, 744, 26, p['base'], p['finish'], art, p.get('base2')) +
               '<rect x="58" y="40" width="262" height="560" rx="20" fill="#000" opacity=".55" filter="url(#soft)"/>'
               '<rect x="56" y="34" width="262" height="560" rx="20" fill="#0d0e10"/>'
               '<rect x="60" y="38" width="254" height="552" rx="17" fill="url(#rubber)"/>'
               f'<g fill="#2c3037">{ribs}</g>'
               '<rect x="56" y="560" width="262" height="34" rx="12" fill="url(#metalv)" opacity=".85"/>' +
               title(392, 330, p['name'], p['font'], p['size'], c, -90, p.get('textx', '')) +
               logo(372, 640, .9, c, .85) + led(372, 700, p['led']) +
               '<circle cx="188" cy="686" r="34" fill="#0d0e10"/><circle cx="188" cy="684" r="29" fill="url(#dome)"/>')


none = lambda *a: ''

P = []


def pedal(module_name, face, name, base, labels, font, size, knob_style='black', led_c='#ff3b2b', finish='plain',
          art=none, **kw):
    P.append(dict(module=module_name, face=face, name=name, base=base, labels=labels, font=font, size=size,
                  knob=knob_style, led=led_c, finish=finish, art=art, ink=kw.pop('ink', ink(base)), **kw))


# treadle
pedal('Overdrive', 'treadle', 'Overdrive', '#1b1c1f', ['DRIVE', 'TONE', 'LEVEL'], 'Shrikhand', 64, 'black', '#ff6a1f', 'hammer',
      art=lambda x, y, w, h: art_flames(x, y + h*.45, w, h*.55, ''), tilt=-4, accent='#ff8a3a')
pedal('Distortion', 'treadle', 'DIST', '#3c5fc4', ['DIST', 'TONE', 'LEVEL'], 'Bungee', 84, 'black', '#ffd400', 'flake',
      art=lambda x, y, w, h: art_clip(x + 30, y + 205, w - 60, 70, '#ffd400'), ty=400)
pedal('Chorus', 'treadle', 'Chorus', '#3fbf7c', ['RATE', 'DEPTH', 'MIX'], 'Pacifico', 70, 'black', '#5cf2a8', 'plain',
      art=lambda x, y, w, h: art_sines(x, y + h*.2, w, h*.75, ''), ty=388)
pedal('Modulation', 'treadle', 'MOD', '#6a3fd0', ['RATE', 'DEPTH', 'SHAPE', 'MIX'], 'Audiowide', 84, '#b58cff', '#b58cff', 'flake',
      art=lambda x, y, w, h: art_swirl(x, y, w, h, '#d9c6ff'), ty=398)
pedal('Delay', 'treadle', 'DELAY', '#1fb8c2', ['TIME', 'F.BACK', 'MIX'], 'Righteous', 72, 'black', '#3ad6ff', 'plain',
      tart=lambda x, y, w, h: ''.join(f'<text x="{225 + i*16}" y="{392 - i*13}" text-anchor="middle" font-family="Righteous" font-size="72" fill="#ffffff" opacity="{.42 - i*.12:.2f}">DELAY</text>' for i in (3, 2, 1)), ty=392)
pedal('Dub delay', 'treadle', 'DUB', '#d5838f', ['TIME', 'F.BACK', 'TONE', 'MIX'], 'Rubik Mono One', 84, 'cream', '#ffe14a', 'split',
      base2='#2c7a3e', art=lambda x, y, w, h: art_reels(x + w*.1, y + h*.12, w*.8, h*.75, '#fff'), ty=400)
pedal('Spring reverb', 'treadle', 'Spring', '#132a44', ['DWELL', 'TONE', 'MIX'], 'Rye', 66, 'cream', '#ffb02e', 'plain',
      tart=lambda x, y, w, h: art_spring(x, y + 104, w, 26, ''), ty=380, ink='#f1d39a')
pedal('High-pass gate', 'treadle', 'GATE', '#f5f3f0', ['THRESH', 'FREQ'], 'Bebas Neue', 96, 'black', '#2ee66b', 'plain',
      art=lambda x, y, w, h: art_gate(x + 20, y + 170, w - 40, 110, '#16181c'), ty=400)
pedal('Harmonizer', 'treadle', 'Harmony', '#bfe6df', ['KEY', 'VOICE', 'MIX'], 'Lobster', 72, '#2f8f86', '#2fd9c5', 'plain',
      art=lambda x, y, w, h: art_staff(x + 20, y + 175, w - 40, 100, '#1d5c56'), ty=392)
pedal('Smart tune', 'treadle', 'TUNE', '#dfe2e3', ['KEY', 'SPEED'], 'Space Mono', 76, 'black', '#2ee66b', 'brush',
      art=lambda x, y, w, h: art_tuner(x + 60, y + 180, w - 120, 100, '#16181c'), ty=398, textx='font-weight="700"')
# box
pedal('Reverb', 'box', 'REVERB', '#2f6f86', ['SIZE', 'DECAY', 'TONE', 'PRE', 'DAMP', 'MIX'], 'Monoton', 64, 'dome', '#7fe0ff', 'plain',
      art=lambda x, y, w, h: art_ripples(x, y + 260, w, 300, '#bfefff'))
pedal('Ambience', 'box', 'Ambience', '#0a0f3a', ['SIZE', 'DECAY', 'MOD', 'TONE', 'SHIM', 'MIX'], 'Audiowide', 50, 'dome', '#b56cff', 'plain',
      art=art_stars)
pedal('Dub reverb', 'box', 'DUB VERB', '#b0120f', ['SIZE', 'DECAY', 'TONE', 'LOW', 'HIGH', 'MIX'], 'Shrikhand', 56, 'cream', '#ffe14a', 'marble',
      textx='stroke="#4a0000" stroke-width="8" paint-order="stroke" stroke-linejoin="round"')
pedal('Amp', 'box', 'Amp', '#e3a73c', ['GAIN', 'LEVEL'], 'Fascinate', 104, 'chicken', '#ff3b2b', 'plain',
      art=lambda x, y, w, h: art_tweed(x, y, w, h, ''), ink='#2a1a08', ty=410)
pedal('Octaver', 'box', 'OCTAVES', '#2b1a4a', ['SUB 2', 'SUB 1', 'DRY', 'UP 1', 'UP 2', 'MIX'], 'Righteous', 66, 'black', '#ffb31a', 'plain',
      art=lambda x, y, w, h: art_octaves(x, y + 320, w, 306, ''), ty=405)
pedal('Slicer', 'box', 'SLICER', '#efe8d6', ['RATE', 'DEPTH', 'SHAPE', 'MIX'], 'Bebas Neue', 96, 'black', '#ff3b2b', 'plain',
      art=lambda x, y, w, h: art_slices(x, y + 450, w, 190, ''), ty=430)
# window
pedal('Pitch shift', 'window', 'PITCH', '#3fb6d6', ['SHIFT', 'FINE', 'MIX'], 'Righteous', 76, 'black', '#ff7ab8', 'plain',
      panel='#f6b2cf', art=lambda x, y, w, h: art_arrows(x, y + 40, w, h - 60, '#b0346e'))
pedal('Pumper', 'window', 'PUMPER', '#0a2a78', ['RATE', 'DEPTH', 'MIX'], 'Bungee', 60, 'black', '#ffa52e', 'flake',
      panel='#f5a52e', art=lambda x, y, w, h: art_pump(x, y + 120, w, h - 140, '#7a3d00'))
pedal('Transient', 'window', 'TRANSIENT', '#1f2226', ['ATTACK', 'SUSTAIN', 'MIX'], 'Audiowide', 50, 'black', '#7bf26c', 'hammer',
      panel='#7bc46c', art=lambda x, y, w, h: art_spike(x, y + 40, w, h - 40, '#1e4d17'))
pedal('Doubler', 'window', 'Doubler', '#d2d3d6', ['SPREAD', 'DETUNE', 'MIX'], 'Lobster', 74, 'black', '#ff5fb4', 'brush',
      panel='#eaa6d0', art=lambda x, y, w, h: art_double(x, y, w, h, '#8f2a66'))
# module
pedal('Compressor', 'module', 'COMP', '#0d1d33', ['THRESH', 'RATIO', 'ATTACK', 'RELEASE', 'KNEE', 'MAKEUP'], 'Bebas Neue', 76, 'dome', '#ffb02e', 'brush',
      disp=disp_vu)
pedal('Four-band EQ', 'module', 'EQ', '#1b1c1f', ['LOW', 'LO MID', 'HI MID', 'HIGH', 'TRIM', 'MIX'], 'Bebas Neue', 76, '#2ab0ff', '#2ab0ff', 'brush',
      disp=lambda x, y, w, h: disp_curve(x, y, w, h, 'eq4', '#2ab0ff'))
pedal('Parametric EQ', 'module', 'PARA EQ', '#b5b4b5', ['FREQ', 'GAIN', 'Q', 'LOW', 'HIGH', 'TRIM'], 'Bebas Neue', 76, 'black', '#ff9a2e', 'brush',
      disp=lambda x, y, w, h: disp_curve(x, y, w, h, 'bell', '#ffb02e'))
pedal('Low-pass filter', 'module', 'LPF', '#c9c8c9', ['FREQ', 'RES', 'DRIVE', 'MIX'], 'Bebas Neue', 76, '#e8433a', '#ff3b2b', 'brush',
      disp=lambda x, y, w, h: disp_curve(x, y, w, h, 'lpf', '#ff5a4a'))
pedal('Vinyl', 'module', 'VINYL', '#122238', ['WEAR', 'CRACKLE', 'WOW', 'NOISE', 'TONE', 'MIX'], 'Lobster', 70, 'cream', '#ffb02e', 'brush',
      disp=disp_record)
pedal('Degrade', 'module', 'DEGRADE', '#8a3f0c', ['BITS', 'RATE', 'NOISE', 'TONE', 'DRIVE', 'MIX'], 'Press Start 2P', 34, 'black', '#7bf26c', 'brush',
      disp=lambda x, y, w, h: disp_pixels(x, y, w, h, '#7bf26c'))
# rocker
pedal('Wah', 'rocker', 'Wah', '#141517', [], 'Shrikhand', 88, 'black', '#ff3b2b', 'hammer')
pedal('Whammy', 'rocker', 'WHAM', '#a3171c', [], 'Bungee', 72, 'black', '#ffe14a', 'flake',
      art=lambda x, y, w, h: ''.join(f'<path d="M{x + w/2 - 18} {y + 600 - i*60} L{x + w/2} {y + 578 - i*60} L{x + w/2 + 18} {y + 600 - i*60}" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="{.5 - i*.12:.2f}"/>' for i in range(4)))

ANGLES = [-60, 30, -20, 70, 10, -100]
for p in P:
    p['angles'] = ANGLES[:len(p['labels'])]
    if p['face'] in ('treadle', 'box', 'window') and 'art' in p and p['face'] != 'box':
        pass
    # face graphic callables take (x, y, w, h); bind the colour-taking helpers already done above
    a = p['art']
    p['art'] = (lambda f: (lambda x, y, w, h: f(x, y, w, h) if f.__code__.co_argcount == 4 else f(x, y, w, h, '')))(a)

RENDER = {'treadle': treadle, 'box': box, 'window': window, 'module': module, 'rocker': rocker}


def prefixed(s, k):
    ids = set(re.findall(r'id="([^"]+)"', s))
    for i in sorted(ids, key=len, reverse=True):
        s = s.replace(f'id="{i}"', f'id="p{k}{i}"').replace(f'url(#{i})', f'url(#p{k}{i})')
    return s


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    fam = '&'.join('family=' + f.replace(' ', '+') for f in FONTS)
    html = [f'<html><head><link href="https://fonts.googleapis.com/css2?{fam}&display=block" rel="stylesheet"></head>'
            '<body style="margin:0;background:#26282c;font-family:Helvetica;color:#ddd;width:2400px">']
    face = None
    for k, p in enumerate(P):
        s = RENDER[p['face']](p)
        open(os.path.join(out, p['module'].lower().replace(' ', '-') + '.svg'), 'w').write(s)
        if p['face'] != face:
            if face:
                html.append('</div>')
            face = p['face']
            html.append(f'<div style="padding:18px 24px 4px;font-size:26px;font-weight:700">{face}</div>'
                        '<div style="display:flex;align-items:flex-end;gap:18px;padding:0 24px 10px">')
        w = 200
        html.append(f'<div style="text-align:center;width:{w}px">{prefixed(s, k).replace("<svg ", f"<svg width=\"{w}\" ")}'
                    f'<div style="font-size:15px">{p["module"]}</div></div>')
    html.append('</div></body></html>')
    open(os.path.join(out, 'sheet.html'), 'w').write(''.join(html))
