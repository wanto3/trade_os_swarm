#!/usr/bin/env node
// Standalone script to fetch YouTube transcripts
// Run outside Next.js bundler to avoid undici/File compatibility issues

if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File extends Blob {
    constructor(parts, filename, options = {}) {
      super(parts)
      this.name = filename
      this.lastModified = options.lastModified || Date.now()
      this.lastModifiedDate = new Date(this.lastModified)
      this.webkitRelativePath = options.webkitRelativePath || ''
      this.type = options.type || ''
    }
  }
}

const videoId = process.argv[2] || process.env.VIDEO_ID
if (!videoId) {
  console.error('Usage: node fetch-transcript.mjs <videoId>')
  process.exit(1)
}

async function main() {
  try {
    const { YouTubeTranscript } = await import('youtube-transcript-api')
    const transcript = await YouTubeTranscript.getTranscript(videoId, {
      lang: 'en',
      disableGoogleBoost: true,
    })
    const text = transcript.map((e) => e.text).join(' ')
    console.log(JSON.stringify({ success: true, text, videoId }))
  } catch (err) {
    console.error(JSON.stringify({ success: false, error: err.message, videoId }))
    process.exit(1)
  }
}

main()
