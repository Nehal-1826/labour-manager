import sys, zipfile
import xml.dom.minidom

base = sys.argv[1]
ok = True
for f in ['labour', 'monthly', 'yearly']:
    p = base + '/' + f + '.docx'
    z = zipfile.ZipFile(p)
    if z.testzip() is not None:
        print(f'{f}.docx: CORRUPT ZIP'); ok = False; continue
    doc_xml = z.read('word/document.xml').decode('utf-8')
    rows = doc_xml.count('<w:tr')
    tables = doc_xml.count('<w:tbl>')
    # docx-js may encode rupee sign literally or as a numeric XML entity (&#8377;)
    rupee = ('\u20b9' in doc_xml) or ('&#8377;' in doc_xml)
    print(f'{f}.docx: ZIP ok | {len(doc_xml)} chars | tables={tables} | rows={rows} | rupee={rupee}')
    xml.dom.minidom.parseString(doc_xml)
    print('   XML parses cleanly')
if not ok:
    sys.exit(1)
