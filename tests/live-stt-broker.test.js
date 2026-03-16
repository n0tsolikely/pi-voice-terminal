const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { LiveSttBroker, createMockWorker } = require('../lib/live-stt-broker')

test('startSession writes worker commands and relays partial/final events', async () => {
  const baseDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pi-voice-terminal-live-stt-'))
  const modelPath = path.join(baseDir, 'model')
  const sentEvents = []
  const writes = []
  const worker = createMockWorker()

  await fs.promises.mkdir(modelPath)
  worker.stdin.on('write', (value) => {
    writes.push(String(value).trim())
  })

  const broker = new LiveSttBroker({
    baseDir,
    modelPath,
    runCommand: async () => 'Python 3.11.0',
    send: (channel, payload) => {
      sentEvents.push({ channel, payload })
    },
    spawnChild: () => worker
  })

  await broker.startSession({
    sessionId: 'session-1',
    language: 'en-US'
  })

  assert.equal(JSON.parse(writes[0]).type, 'start_session')

  worker.stdout.emit('data', JSON.stringify({
    type: 'partial',
    sessionId: 'session-1',
    text: 'hello'
  }) + '\n')
  worker.stdout.emit('data', JSON.stringify({
    type: 'final',
    sessionId: 'session-1',
    text: 'hello world'
  }) + '\n')

  assert.deepEqual(sentEvents, [
    {
      channel: 'stt:live-partial',
      payload: {
        type: 'partial',
        sessionId: 'session-1',
        text: 'hello'
      }
    },
    {
      channel: 'stt:live-final',
      payload: {
        type: 'final',
        sessionId: 'session-1',
        text: 'hello world'
      }
    }
  ])
})

test('request errors are rejected and forwarded to the renderer', async () => {
  const baseDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pi-voice-terminal-live-stt-'))
  const modelPath = path.join(baseDir, 'model')
  const worker = createMockWorker()
  const sentEvents = []

  await fs.promises.mkdir(modelPath)

  const broker = new LiveSttBroker({
    baseDir,
    modelPath,
    runCommand: async () => 'Python 3.11.0',
    send: (channel, payload) => {
      sentEvents.push({ channel, payload })
    },
    spawnChild: () => worker
  })

  await broker.ensureWorker()
  const pending = broker.requestResponse('request-1', () => {
    broker.sendCommand({
      type: 'transcribe_file',
      requestId: 'request-1',
      wavPath: '/tmp/fake.wav'
    })
  })

  worker.stdout.emit('data', JSON.stringify({
    type: 'error',
    requestId: 'request-1',
    message: 'bad wav'
  }) + '\n')

  await assert.rejects(pending, /bad wav/)
  assert.equal(sentEvents[0].channel, 'stt:live-error')
})
