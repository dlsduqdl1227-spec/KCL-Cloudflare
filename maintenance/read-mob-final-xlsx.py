import json, sys, zipfile, xml.etree.ElementTree as ET

# Read only: HanCell's invalid style indexes prevent openpyxl from opening this
# source. Read its actual OOXML values without changing the supplied workbook.
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as archive:
    strings = [''.join(item.itertext()) for item in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', ns)] if 'xl/sharedStrings.xml' in archive.namelist() else []
    sheets = []
    for name in ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']:
        cells = {}
        for cell in ET.fromstring(archive.read(name)).findall('m:sheetData/m:row/m:c', ns):
            value, inline = cell.find('m:v', ns), cell.find('m:is', ns)
            if cell.get('t') == 's' and value is not None:
                cells[cell.get('r')] = strings[int(value.text)]
            elif inline is not None:
                cells[cell.get('r')] = ''.join(inline.itertext())
            elif value is not None:
                cells[cell.get('r')] = value.text
        sheets.append(cells)
    print(json.dumps(sheets, ensure_ascii=False))
