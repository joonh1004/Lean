"""Wrap exact, approved PNG bytes in a one-picture HWPX. No OCR or re-encoding."""
import argparse
import io
import sys
from pathlib import Path

from PIL import Image
from hwpx import HwpxDocument
from hwpx.tools.package_validator import validate_package

MAX_BYTES = 70 * 1024 * 1024


def make_hwpx(png):
    if len(png) > MAX_BYTES:
        raise ValueError('PNG exceeds byte limit')
    with Image.open(io.BytesIO(png), formats=['PNG']) as image:
        w, h = image.size
        if max(w, h) > 10000 or w * h > 16_000_000 or image.is_animated:
            raise ValueError('PNG exceeds pixel limit or is animated')
        image.verify()
    # Fit the default A4 content area. Maintain the original pixel aspect ratio.
    scale = min(155 * 7200 / 25.4 / w, 220 * 7200 / 25.4 / h)
    with HwpxDocument.new() as doc:
        doc.add_picture(png, 'png', width=max(1, round(w * scale)), height=max(1, round(h * scale)))
        if not doc.validate().ok:
            raise ValueError('Generated document failed XML validation')
        output = doc.to_bytes()
    if not validate_package(output).ok:
        raise ValueError('Generated document failed HWPX package validation')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('approved_png', nargs='?', type=Path)
    parser.add_argument('output_hwpx', nargs='?', type=Path)
    args = parser.parse_args()
    if bool(args.approved_png) != bool(args.output_hwpx):
        parser.error('Provide both paths, or neither for stdin/stdout.')
    if args.approved_png:
        if args.approved_png.resolve() == args.output_hwpx.resolve() or args.output_hwpx.suffix.lower() != '.hwpx':
            parser.error('Choose a separate .hwpx destination.')
        with args.approved_png.open('rb') as source:
            output = make_hwpx(source.read(MAX_BYTES + 1))
        with args.output_hwpx.open('xb') as destination:
            destination.write(output)
    else:
        sys.stdout.buffer.write(make_hwpx(sys.stdin.buffer.read(MAX_BYTES + 1)))


if __name__ == '__main__':
    main()
