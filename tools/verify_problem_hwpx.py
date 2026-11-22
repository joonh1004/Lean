"""Verify that a single-problem HWPX displays the exact approved image file.
Usage: python tools/verify_problem_hwpx.py exported.hwpx approved-image.png
No extraction, network calls, or writes; this is not a layout/rendering test.
"""
import argparse
import hashlib
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


def verify(document, approved):
    with zipfile.ZipFile(document) as package:
        manifest = ET.fromstring(package.read('Contents/content.hpf'))
        assets = {item.get('id'): item.get('href') for item in manifest.findall('.//{*}manifest/{*}item')}
        refs = []
        for section in package.namelist():
            if section.startswith('Contents/section') and section.endswith('.xml'):
                root = ET.fromstring(package.read(section))
                refs.extend(img.get('binaryItemIDRef') for img in root.findall('.//{*}pic//{*}img'))
        if len(refs) != 1 or refs[0] not in assets:
            raise ValueError('Expected one referenced problem picture')
        href = assets[refs[0]]
        embedded = package.read(href)
        if embedded != Path(approved).read_bytes():
            raise ValueError('The displayed picture differs from the approved image')
        return f'{href}: exact match (SHA-256 {hashlib.sha256(embedded).hexdigest()})'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('document', type=Path)
    parser.add_argument('approved', type=Path)
    args = parser.parse_args()
    try:
        print(verify(args.document, args.approved))
    except (OSError, ValueError, KeyError, ET.ParseError, zipfile.BadZipFile) as error:
        parser.exit(1, f'FAIL: {error}\n')
