import os
from fontTools.ttLib import TTFont
from fontTools import subset
chars = set(chr(c) for c in range(0x20,0x7F)) | set(chr(c) for c in range(0xA0,0x100)) \
  | set(chr(c) for c in range(0x3000,0x30FF)) | set(chr(c) for c in range(0x3200,0x33FF)) \
  | set(chr(c) for c in range(0xFF00,0xFF60))
for o in range(0x4E00,0x9FA0):
    ch=chr(o)
    try: ch.encode('euc_jp'); chars.add(ch)
    except: pass
text=''.join(sorted(chars))
os.chdir('/opt/share/othello/app')
for w in ['Regular','Bold']:
    opts=subset.Options()
    opts.flavor='woff2'; opts.ignore_missing_glyphs=True; opts.ignore_missing_unicodes=True
    opts.name_IDs=['*']; opts.notdef_outline=True
    font=TTFont(f'/opt/data/home/.fonts/MoralerspaceNeon-{w}.ttf')
    s=subset.Subsetter(opts); s.populate(text=text); s.subset(font)
    font.flavor='woff2'
    font.save(f'public/fonts/MoralerspaceNeon-{w}.woff2')
    print(w, os.path.getsize(f'public/fonts/MoralerspaceNeon-{w}.woff2'))
