import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type TestDb } from '../testing/sqlite-db'
import { createTestBucket, type TestBucket } from '../testing/memory-bucket'
import { call, send } from '../testing/request'
import { createSession } from '../auth/sessions'
import { fileKey, uploadType } from './bucket'
import { parseRange } from './serve'

import * as file    from '../../pages/media/[bucket]/[name]'
import * as upload  from '../../pages/api/media/[bucket]/[name]'
import * as episode from '../../pages/api/episodes/[id]/index'

const AUDIO = new Uint8Array(1000).map((_, i) => i % 251)
const text  = async (response: Response) => new Uint8Array(await response.arrayBuffer())

let db: TestDb
let media: TestBucket
let admin: string

beforeEach(async () => {
  db = createTestDb()
  db.raw.exec("INSERT INTO users (id, email, password_hash) VALUES ('u1', 'ofelia@example.com', 'h')")
  admin = (await createSession(db, 'u1')).token

  media = createTestBucket()
  await media.put('audio/1782205259493-dia.mp3', AUDIO, { httpMetadata: { contentType: 'audio/mpeg' } })
  await media.put('covers/1782205259493-cover.webp', new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/webp' } })
})

describe('audio: public read and covers: public read', () => {
  const get = (name: string, headers = {}, bucket = 'audio') => send(file.GET, { db, media, params: { bucket, name }, headers })

  it('anyone gets a whole file with its type, size and long-lived caching', async () => {
    const response = await get('1782205259493-dia.mp3')
    expect(response.status).toBe(200)
    expect(await text(response)).toEqual(AUDIO)
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(response.headers.get('Content-Length')).toBe('1000')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Cache-Control')).toContain('immutable')

    expect((await get('1782205259493-cover.webp', {}, 'covers')).headers.get('Content-Type')).toBe('image/webp')
  })

  it('answers the partial requests a player makes when seeking', async () => {
    const cases: [string, number, number][] = [['bytes=0-9', 0, 10], ['bytes=990-', 990, 10], ['bytes=-4', 996, 4], ['bytes=500-99999', 500, 500]]
    for (const [range, start, length] of cases) {
      const response = await get('1782205259493-dia.mp3', { Range: range })
      expect(response.status, range).toBe(206)
      expect(response.headers.get('Content-Range'), range).toBe(`bytes ${start}-${start + length - 1}/1000`)
      expect(response.headers.get('Content-Length'), range).toBe(String(length))
      expect(await text(response), range).toEqual(AUDIO.slice(start, start + length))
    }
  })

  it('refuses a range outside the file and says how long the file is', async () => {
    const response = await get('1782205259493-dia.mp3', { Range: 'bytes=1000-' })
    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe('bytes */1000')
  })

  it('answers "not changed" to a browser that already has the file', async () => {
    const etag = (await get('1782205259493-dia.mp3')).headers.get('ETag')!
    const again = await get('1782205259493-dia.mp3', { 'If-None-Match': etag })
    expect(again.status).toBe(304)
    expect((await text(again)).length).toBe(0)
  })

  it('answers 404 for a missing file, an unknown folder or an odd name', async () => {
    expect((await get('nope.mp3')).status).toBe(404)
    expect((await get('1782205259493-dia.mp3', {}, 'private')).status).toBe(404)
    expect((await get('..', {}, 'audio')).status).toBe(404)
  })
})

describe('audio: auth upload and covers: auth upload', () => {
  const put = (name: string, options: object = {}, bucket = 'audio') =>
    call(upload.PUT, { db, media, method: 'PUT', params: { bucket, name }, bytes: AUDIO, headers: { 'Content-Type': 'audio/mpeg' }, ...options })

  it('anonymous is refused and nothing is stored', async () => {
    expect((await put('new.mp3')).status).toBe(401)
    expect(media.files.has('audio/new.mp3')).toBe(false)
  })

  it('an admin uploads a file, which is then served with its type', async () => {
    const { status, data } = await put('1791000000000-nuevo.mp3', { token: admin })
    expect(status).toBe(201)
    expect(data).toEqual({ path: '1791000000000-nuevo.mp3' })

    const served = await send(file.GET, { db, media, params: { bucket: 'audio', name: '1791000000000-nuevo.mp3' } })
    expect(await text(served)).toEqual(AUDIO)
    expect(served.headers.get('Content-Type')).toBe('audio/mpeg')
  })

  it('never replaces a file that is already there', async () => {
    const { status } = await put('1782205259493-dia.mp3', { token: admin, bytes: new Uint8Array([9]) })
    expect(status).toBe(409)
    expect(media.files.get('audio/1782205259493-dia.mp3')!.bytes).toEqual(AUDIO)
  })

  it('keeps the 50 MB limit, wants audio in audio/ and images in covers/, and a plain name', async () => {
    expect((await put('big.mp3', { token: admin, headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(50 * 1024 * 1024 + 1) } })).status).toBe(413)
    expect((await put('page.html', { token: admin, headers: { 'Content-Type': 'text/html' } })).status).toBe(415)
    expect((await put('song.mp3', { token: admin }, 'covers')).status).toBe(415)
    expect((await put('with space.mp3', { token: admin })).status).toBe(400)
    expect((await put('x.mp3', { token: admin }, 'private')).status).toBe(400)
    expect(media.files.size).toBe(2)
  })

  it('keeps nothing when fewer bytes arrive than announced', async () => {
    const { status } = await put('cut.mp3', { token: admin, headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '5000' } })
    expect(status).toBe(400)
    expect(media.files.has('audio/cut.mp3')).toBe(false)
  })

  it('works out the type from the extension when the browser sends none', async () => {
    expect(uploadType('audio', 'a.m4a', null)).toBe('audio/x-m4a')
    expect(uploadType('audio', 'a.MP3', '')).toBe('audio/mpeg')
    expect(uploadType('covers', 'c.webp', 'image/webp; charset=binary')).toBe('image/webp')
    expect(uploadType('audio', 'a.exe', null)).toBeNull()
  })

  it('is refused from another site even with an admin session', async () => {
    expect((await put('new.mp3', { token: admin, origin: 'https://evil.example' })).status).toBe(403)
  })
})

describe('audio: auth delete and covers: auth delete (with the episode)', () => {
  beforeEach(() => {
    db.raw.exec(`INSERT INTO episodes (id, title, audio_path, cover_path) VALUES ('e1', 'Día de Canarias', '1782205259493-dia.mp3', '1782205259493-cover.webp')`)
  })

  it('deleting an episode removes its audio and cover, and nothing else', async () => {
    await media.put('audio/other.mp3', AUDIO)
    const { status } = await call(episode.DELETE, { db, media, method: 'DELETE', params: { id: 'e1' }, token: admin })

    expect(status).toBe(200)
    expect([...media.files.keys()]).toEqual(['audio/other.mp3'])
  })

  it('anonymous cannot delete, and the files stay', async () => {
    expect((await call(episode.DELETE, { db, media, method: 'DELETE', params: { id: 'e1' } })).status).toBe(401)
    expect(media.files.size).toBe(2)
  })

  it('still removes the episode where no file bucket is attached', async () => {
    expect((await call(episode.DELETE, { db, method: 'DELETE', params: { id: 'e1' }, token: admin })).status).toBe(200)
  })
})

describe('details', () => {
  it('reads byte ranges the way players write them', () => {
    expect(parseRange('bytes=0-0', 10)).toEqual({ start: 0, length: 1 })
    expect(parseRange('bytes=-100', 10)).toEqual({ start: 0, length: 10 })
    for (const bad of ['bytes=5-2', 'bytes=-', 'bytes=10-', 'bytes=0-1,3-4', 'items=0-1', 'bytes=-0']) {
      expect(parseRange(bad, 10), bad).toBeNull()
    }
  })

  it('accepts only the two folders and plain names', () => {
    expect(fileKey('audio', '1774208716179-Las-lenguas.--En-el-instituto.m4a')).toBe('audio/1774208716179-Las-lenguas.--En-el-instituto.m4a')
    for (const [folder, name] of [['audio', 'a/b.mp3'], ['audio', '.'], ['audio', ''], ['other', 'a.mp3'], [undefined, 'a.mp3']]) {
      expect(fileKey(folder, name)).toBeNull()
    }
  })

  it('answers 503 where the file bucket is not attached yet', async () => {
    expect((await send(file.GET, { db, params: { bucket: 'audio', name: 'a.mp3' } })).status).toBe(503)
    expect((await call(upload.PUT, { db, method: 'PUT', params: { bucket: 'audio', name: 'a.mp3' }, bytes: AUDIO, token: admin })).status).toBe(503)
  })
})
