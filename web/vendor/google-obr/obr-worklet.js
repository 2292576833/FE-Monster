/*
 * FE Monster AudioWorklet bridge for the official Google Open Binaural
 * Renderer WebAssembly build.
 *
 * The renderer itself is built from google/obr at the revision recorded in
 * REVISION. Its BSD 3-Clause Clear and OBR Patent License notices are shipped
 * beside this file as LICENSE and PATENTS.
 */
import createOfficialObrModule from './obr-official.js';

const EXPECTED_BACKEND = 'google-obr-official';
const EXPECTED_REVISION = '478dc7c752d5eccae534635139ff0253eee3a14a';
const FRAME_COUNT = 128;
const AMBIENT_FILTER_PROFILE = 1;
const METRICS_INTERVAL_BLOCKS = 128;

class FeGoogleObrProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.module = null;
    this.renderer = 0;
    this.enabled = false;
    this.ready = false;
    this.failed = false;
    this.processedBlocks = 0;
    this.inputLeftPointer = 0;
    this.inputRightPointer = 0;
    this.outputLeftPointer = 0;
    this.outputRightPointer = 0;
    this.channelLayout = this.normalizeChannelLayout(options.processorOptions?.channelLayout);
    this.inputChannelCount = this.channelLayout === '7.1' ? 8 : this.channelLayout === '5.1' ? 6 : 2;
    this.virtualLeft = new Float32Array(FRAME_COUNT);
    this.virtualRight = new Float32Array(FRAME_COUNT);
    this.surroundDelay = new Float32Array(4096);
    this.surroundDelayIndex = 0;
    this.lfeState = 0;
    this.initialize();

    this.port.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === 'set-enabled') {
        this.enabled = message.enabled === true && this.ready && !this.failed;
      } else if (message.type === 'set-layout') {
        this.setChannelLayout(message.channelLayout);
      }
    };
  }

  normalizeChannelLayout(value) {
    return value === '5.1' || value === '7.1' ? value : 'stereo';
  }

  setChannelLayout(value) {
    this.channelLayout = this.normalizeChannelLayout(value);
    this.inputChannelCount = this.channelLayout === '7.1' ? 8 : this.channelLayout === '5.1' ? 6 : 2;
    this.surroundDelay.fill(0);
    this.surroundDelayIndex = 0;
    this.lfeState = 0;
  }

  async initialize() {
    try {
      const module = await createOfficialObrModule({ noInitialRun: true });
      const backend = module.UTF8ToString(module._obr_backend_name());
      const revision = module.UTF8ToString(module._obr_source_revision());
      if (backend !== EXPECTED_BACKEND || revision !== EXPECTED_REVISION) {
        throw new Error(`Official OBR identity mismatch: ${backend}@${revision}`);
      }
      if (!(module.HEAPF32 instanceof Float32Array)) {
        throw new Error('Official OBR float heap is unavailable.');
      }

      const renderer = module._obr_create(FRAME_COUNT, sampleRate, AMBIENT_FILTER_PROFILE);
      if (!renderer || module._obr_is_ready(renderer) !== 1) {
        throw new Error('Official OBR stereo renderer failed to initialize.');
      }

      this.module = module;
      this.renderer = renderer;
      this.inputLeftPointer = module._obr_input_channel(renderer, 0);
      this.inputRightPointer = module._obr_input_channel(renderer, 1);
      this.outputLeftPointer = module._obr_output_channel(renderer, 0);
      this.outputRightPointer = module._obr_output_channel(renderer, 1);
      if (
        !this.inputLeftPointer ||
        !this.inputRightPointer ||
        !this.outputLeftPointer ||
        !this.outputRightPointer
      ) {
        throw new Error('Official OBR PCM channel pointers are unavailable.');
      }

      this.ready = true;
      this.port.postMessage({
        type: 'ready',
        backend: EXPECTED_BACKEND,
        revision: EXPECTED_REVISION,
        frameCount: FRAME_COUNT,
        channelLayout: this.channelLayout,
        inputChannelCount: this.inputChannelCount,
        sampleRate
      });
    } catch (error) {
      this.fail(error);
    }
  }

  fail(error) {
    this.failed = true;
    this.ready = false;
    this.enabled = false;
    this.port.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error || 'Google OBR failed.')
    });
  }

  clearOutput(output) {
    if (!output) return;
    for (const channel of output) channel.fill(0);
  }

  virtualizeInput(inputLeft, inputRight) {
    if (this.channelLayout === 'stereo') return [inputLeft, inputRight];
    const delayLength = this.surroundDelay.length;
    const firstDelay = Math.min(delayLength - 1, Math.round(sampleRate * 0.012));
    const secondDelay = Math.min(delayLength - 1, Math.round(sampleRate * 0.022));
    const sevenOne = this.channelLayout === '7.1';
    let writeIndex = this.surroundDelayIndex;
    let lfe = this.lfeState;
    const lfeAlpha = 1 - Math.exp((-2 * Math.PI * 120) / sampleRate);
    for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
      const left = inputLeft[frame] || 0;
      const right = inputRight[frame] || 0;
      const center = (left + right) * 0.5;
      const side = (left - right) * 0.5;
      lfe += lfeAlpha * (center - lfe);
      this.surroundDelay[writeIndex] = side;
      const firstRear = this.surroundDelay[(writeIndex - firstDelay + delayLength) % delayLength];
      const secondRear = sevenOne
        ? this.surroundDelay[(writeIndex - secondDelay + delayLength) % delayLength]
        : 0;
      const frontGain = sevenOne ? 0.68 : 0.74;
      const rear = firstRear * (sevenOne ? 0.15 : 0.18) + secondRear * 0.12;
      this.virtualLeft[frame] = Math.max(-1, Math.min(1, left * frontGain + center * 0.1 + lfe * 0.04 + rear));
      this.virtualRight[frame] = Math.max(-1, Math.min(1, right * frontGain + center * 0.1 + lfe * 0.04 - rear));
      writeIndex = (writeIndex + 1) % delayLength;
    }
    this.surroundDelayIndex = writeIndex;
    this.lfeState = lfe;
    return [this.virtualLeft, this.virtualRight];
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    if (!this.enabled || !this.ready || this.failed || !this.module || !this.renderer) {
      this.clearOutput(output);
      return true;
    }

    const input = inputs[0] || [];
    const inputLeft = input[0];
    const inputRight = input[1] || inputLeft;
    if (!inputLeft) {
      this.clearOutput(output);
      return true;
    }

    try {
      const heap = this.module.HEAPF32;
      if (!(heap instanceof Float32Array)) {
        throw new Error('Official OBR float heap became unavailable.');
      }
      const inputLeftOffset = this.inputLeftPointer >>> 2;
      const inputRightOffset = this.inputRightPointer >>> 2;
      const outputLeftOffset = this.outputLeftPointer >>> 2;
      const outputRightOffset = this.outputRightPointer >>> 2;
      const [renderLeft, renderRight] = this.virtualizeInput(inputLeft, inputRight);
      heap.set(renderLeft, inputLeftOffset);
      heap.set(renderRight, inputRightOffset);

      if (this.module._obr_process(this.renderer) !== 1) {
        throw new Error('Official OBR Process returned a failure status.');
      }

      const outputLeft = output[0];
      const outputRight = output[1];
      let inputEnergy = 0;
      let outputEnergy = 0;
      for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
        const leftIn = inputLeft[frame] || 0;
        const rightIn = inputRight[frame] || 0;
        const leftOut = heap[outputLeftOffset + frame];
        const rightOut = heap[outputRightOffset + frame];
        if (!Number.isFinite(leftOut) || !Number.isFinite(rightOut)) {
          throw new Error('Official OBR Process produced non-finite PCM.');
        }
        outputLeft[frame] = leftOut;
        outputRight[frame] = rightOut;
        inputEnergy += leftIn * leftIn + rightIn * rightIn;
        outputEnergy += leftOut * leftOut + rightOut * rightOut;
      }

      this.processedBlocks += 1;
      if (this.processedBlocks === 1 || this.processedBlocks % METRICS_INTERVAL_BLOCKS === 0) {
        const sampleCount = FRAME_COUNT * 2;
        this.port.postMessage({
          type: 'metrics',
          backend: EXPECTED_BACKEND,
          revision: EXPECTED_REVISION,
          channelLayout: this.channelLayout,
          inputChannelCount: this.inputChannelCount,
          processedBlocks: this.processedBlocks,
          inputRms: Math.sqrt(inputEnergy / sampleCount),
          outputRms: Math.sqrt(outputEnergy / sampleCount)
        });
      }
    } catch (error) {
      this.clearOutput(output);
      this.fail(error);
    }
    return true;
  }
}

registerProcessor('fe-google-obr', FeGoogleObrProcessor);
