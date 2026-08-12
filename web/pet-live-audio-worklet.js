'use strict';

const FE_PET_DEFAULT_SAMPLE_RATE = 16_000;
const FE_PET_DEFAULT_FRAME_SAMPLES = 320;

class FePetLiveCaptureProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    const requestedRate = Number(options.processorOptions?.targetSampleRate);
    const requestedFrameSamples = Number(options.processorOptions?.frameSamples);
    this.targetSampleRate = Number.isFinite(requestedRate)
      ? Math.max(8_000, Math.min(48_000, Math.round(requestedRate)))
      : FE_PET_DEFAULT_SAMPLE_RATE;
    this.frameSamples = Number.isFinite(requestedFrameSamples)
      ? Math.max(80, Math.min(2_048, Math.round(requestedFrameSamples)))
      : FE_PET_DEFAULT_FRAME_SAMPLES;
    this.inputSamplesPerOutput = Math.max(1, sampleRate / this.targetSampleRate);
    this.frame = new Float32Array(this.frameSamples);
    this.frameOffset = 0;
    this.frameEnergy = 0;
    this.inputIndex = 0;
    this.previousInputIndex = 0;
    this.previousSample = 0;
    this.nextOutputPosition = 0;
    this.hasPreviousSample = false;
    this.active = true;
    this.port.onmessage = (event) => {
      if (event.data?.type === 'close') this.active = false;
    };
  }

  emitSample(sample) {
    const value = Number.isFinite(sample) ? Math.max(-1, Math.min(1, sample)) : 0;
    this.frame[this.frameOffset] = value;
    this.frameOffset += 1;
    this.frameEnergy += value * value;
    if (this.frameOffset < this.frameSamples) return;

    const pcm = this.frame;
    this.port.postMessage({
      type: 'frame',
      pcm,
      rms: Math.sqrt(this.frameEnergy / this.frameSamples),
      sampleRate: this.targetSampleRate,
      durationMs: this.frameSamples / this.targetSampleRate * 1_000
    }, [pcm.buffer]);
    this.frame = new Float32Array(this.frameSamples);
    this.frameOffset = 0;
    this.frameEnergy = 0;
  }

  consumeInputSample(sample) {
    const currentIndex = this.inputIndex;
    this.inputIndex += 1;
    if (!this.hasPreviousSample) {
      this.previousSample = sample;
      this.previousInputIndex = currentIndex;
      this.hasPreviousSample = true;
    }

    while (this.nextOutputPosition <= currentIndex) {
      const width = currentIndex - this.previousInputIndex;
      const fraction = width > 0
        ? (this.nextOutputPosition - this.previousInputIndex) / width
        : 1;
      this.emitSample(this.previousSample + (sample - this.previousSample) * fraction);
      this.nextOutputPosition += this.inputSamplesPerOutput;
    }
    this.previousSample = sample;
    this.previousInputIndex = currentIndex;
  }

  process(inputs, outputs) {
    for (const output of outputs) {
      for (const channel of output) channel.fill(0);
    }
    if (!this.active) return false;
    const channels = inputs[0];
    const sampleCount = channels?.[0]?.length || 0;
    if (!sampleCount) return true;

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      let mono = 0;
      for (const channel of channels) mono += channel[sampleIndex] || 0;
      this.consumeInputSample(mono / channels.length);
    }
    return true;
  }
}

registerProcessor('fe-pet-live-capture', FePetLiveCaptureProcessor);
