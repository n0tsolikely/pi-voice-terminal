#!/usr/bin/env node

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { RuntimeLogger } = require('../lib/runtime-logger')
const { AUTO_STRATEGIES, MIC_MODES, createMicState, transitionMicState } = require('../lib/mic-state')

const repoRoot = path.join(__dirname, '..')

async function main() {
  const runtimeLogger = new RuntimeLogger({
    baseDir: repoRoot
  })
  const logInfo = runtimeLogger.getInfo()
  let state = createMicState({
    mode: MIC_MODES.TOGGLE,
    liveDictationSupported: true,
    autoStrategy: AUTO_STRATEGIES.LIVE
  })

  state = transitionMicState(state, {
    type: 'SET_MODE',
    mode: MIC_MODES.HOLD
  })
  await runtimeLogger.log('mic.mode_changed', {
    mode: MIC_MODES.HOLD
  }, {
    component: 'verify-modes',
    processType: 'script'
  })

  state = transitionMicState(state, {
    type: 'SET_MODE',
    mode: MIC_MODES.TOGGLE
  })
  await runtimeLogger.log('mic.mode_changed', {
    mode: MIC_MODES.TOGGLE
  }, {
    component: 'verify-modes',
    processType: 'script'
  })

  state = transitionMicState(state, {
    type: 'SET_MODE',
    mode: MIC_MODES.AUTO
  })
  await runtimeLogger.log('mic.mode_changed', {
    mode: MIC_MODES.AUTO
  }, {
    component: 'verify-modes',
    processType: 'script'
  })

  state = transitionMicState(state, {
    type: 'AUTO_ARM'
  })
  await runtimeLogger.log('mic.auto_enabled', {
    strategy: state.autoStrategy
  }, {
    component: 'verify-modes',
    processType: 'script'
  })

  assert.equal(state.mode, MIC_MODES.AUTO)
  assert.equal(state.autoEnabled, true)

  await runtimeLogger.flush()

  const latestLog = fs.readFileSync(logInfo.latestLogPath, 'utf8')

  assert.match(latestLog, /"type":"mic\.mode_changed".*"mode":"hold"/)
  assert.match(latestLog, /"type":"mic\.mode_changed".*"mode":"toggle"/)
  assert.match(latestLog, /"type":"mic\.mode_changed".*"mode":"auto"/)
  assert.match(latestLog, /"type":"mic\.auto_enabled"/)

  process.stdout.write(`Mode verification succeeded. Runtime log: ${logInfo.latestLogPath}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
