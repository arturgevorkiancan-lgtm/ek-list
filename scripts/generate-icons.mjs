import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public/icon.svg'))

await sharp(svg).resize(192, 192).png().toFile(join(root, 'public/icon-192.png'))
await sharp(svg).resize(512, 512).png().toFile(join(root, 'public/icon-512.png'))

console.log('Generated public/icon-192.png and public/icon-512.png')
