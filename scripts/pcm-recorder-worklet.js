class PcmRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs?.[0]?.[0]

    if (!input?.length) {
      return true
    }

    const pcm16 = convertFloat32ToPcm16(input, sampleRate, 16000)

    if (pcm16.length) {
      this.port.postMessage(pcm16.buffer, [pcm16.buffer])
    }

    return true
  }
}

function convertFloat32ToPcm16(input, inputRate, outputRate) {
  if (inputRate === outputRate) {
    return float32ToInt16(input)
  }

  const sampleRateRatio = inputRate / outputRate
  const outputLength = Math.max(1, Math.round(input.length / sampleRateRatio))
  const output = new Int16Array(outputLength)
  let offsetResult = 0
  let offsetBuffer = 0

  while (offsetResult < output.length) {
    const nextOffsetBuffer = Math.min(input.length, Math.round((offsetResult + 1) * sampleRateRatio))
    let accum = 0
    let count = 0

    for (let index = offsetBuffer; index < nextOffsetBuffer; index += 1) {
      accum += input[index]
      count += 1
    }

    const sample = count ? accum / count : input[offsetBuffer] || 0
    output[offsetResult] = clampPcm16(sample)
    offsetResult += 1
    offsetBuffer = nextOffsetBuffer
  }

  return output
}

function float32ToInt16(input) {
  const output = new Int16Array(input.length)

  for (let index = 0; index < input.length; index += 1) {
    output[index] = clampPcm16(input[index])
  }

  return output
}

function clampPcm16(value) {
  const sample = Math.max(-1, Math.min(1, Number(value) || 0))
  return sample < 0 ? sample * 0x8000 : sample * 0x7fff
}

registerProcessor('pcm-recorder', PcmRecorderProcessor)
