# PNG decoder fixtures

These synthetic PNGs are 3 pixels wide and contain literal test colors, with no third-party assets.
`image.unit.test.ts` checks the pixels extracted by Poppler against independent expected arrays.

- `filters.png`: five RGB rows using PNG filters None, Sub, Up, Average, and Paeth in that order.
- `gray.png`: opaque grayscale values 0, 128, and 255.
- `gray-alpha.png`: the same grayscale values with alpha 0, 127, and 255.
- `rgba.png`: red, green, and blue with alpha 0, 127, and 255.
- `indexed.png`: the same colors with palette transparency; the final palette entry defaults to opaque.
- `gray-key.png`: grayscale with value 128 marked transparent by `tRNS`.
- `rgb-key.png`: red, green, and blue with green marked transparent by `tRNS`.

Each fixture has a valid PNG signature, IHDR, compressed IDAT, IEND, and CRCs, plus PLTE or tRNS
where required. Tests derive malformed variants in memory rather than checking in invalid files.
