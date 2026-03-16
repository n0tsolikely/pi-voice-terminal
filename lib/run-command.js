const { spawn } = require('node:child_process')

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8'
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    if (options.input !== undefined && options.input !== null) {
      child.stdin.end(Buffer.isBuffer(options.input) ? options.input : String(options.input))
    } else {
      child.stdin.end()
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
        return
      }

      const detail = stderr.trim() || stdout.trim() || `exit code ${code}`
      reject(new Error(detail))
    })
  })
}

module.exports = {
  runCommand
}
