import * as fs from 'node:fs'
import * as path from 'node:path'

export function resolveMdDir(mdFilePath: string): string {
  return path.dirname(path.resolve(mdFilePath))
}

export function resolveMdAssetPath(
  mdFilePath: string,
  assetPath: string,
): string {
  return path.isAbsolute(assetPath)
    ? assetPath
    : path.resolve(resolveMdDir(mdFilePath), assetPath)
}

export function isRemoteAssetSource(src: string): boolean {
  return (
    src.startsWith('http') || src.startsWith('//') || src.startsWith('data:')
  )
}

export function ensureDir(dirPath: string): boolean {
  if (fs.existsSync(dirPath)) {
    return false
  }
  fs.mkdirSync(dirPath, { recursive: true })
  return true
}

export function ensureImagesDir(mdFilePath: string): {
  outputDir: string
  relativeDir: string
  created: boolean
} {
  const outputDir = path.join(resolveMdDir(mdFilePath), 'images')
  const created = ensureDir(outputDir)
  return {
    outputDir,
    relativeDir: './images/',
    created,
  }
}

export function getBaseName(filePath: string): string {
  return path.basename(filePath)
}
