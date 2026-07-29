// The transport batch is intentionally larger than OBR's 256-frame render
// quantum. This lowers MessagePort/HTTP/JNI overhead without changing the
// renderer's convolution size or XAudio2 scheduling granularity.
const FE_NATIVE_PCM_TRANSPORT_FRAMES = 4096;
const FE_NATIVE_PCM_CHANNELS = 2;
const FE_NATIVE_PCM_METRICS_INTERVAL = 3;

class FeNativePcmBridgeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = false;
    this.framesWritten = 0;
    this.blocksWritten = 0;
    this.inputEnergy = 0;
    this.pcm = new Float32Array(
      FE_NATIVE_PCM_TRANSPORT_FRAMES * FE_NATIVE_PCM_CHANNELS
    );
    this.port.onmessage = (event) => {
      const message = event.data || {};
      if (message.type !== 'set-enabled') return;
      this.enabled = message.enabled === true;
      if (!this.enabled) {
        this.framesWritten = 0;
        this.inputEnergy = 0;
        this.pcm.fill(0);
      }
    };
    this.port.postMessage({
      type: 'ready',
      backend: 'native-rust-x3d-obr-xaudio2',
      sampleRate
    });
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const left = input[0];
    const right = input[1] || left;
    const frameCount = left?.length || output[0]?.length || 128;

    for (let channel = 0; channel < output.length; channel += 1) {
      output[channel].fill(0);
    }
    if (!this.enabled || !left) return true;

    for (let frame = 0; frame < frameCount; frame += 1) {
      const leftSample = Number.isFinite(left[frame]) ? left[frame] : 0;
      const rightSample = Number.isFinite(right?.[frame])
        ? right[frame]
        : leftSample;
      const writeIndex = this.framesWritten * FE_NATIVE_PCM_CHANNELS;
      this.pcm[writeIndex] = leftSample;
      this.pcm[writeIndex + 1] = rightSample;
      this.inputEnergy += leftSample * leftSample + rightSample * rightSample;
      this.framesWritten += 1;

      if (this.framesWritten !== FE_NATIVE_PCM_TRANSPORT_FRAMES) continue;
      const block = this.pcm;
      const inputRms = Math.sqrt(
        this.inputEnergy
          / (FE_NATIVE_PCM_TRANSPORT_FRAMES * FE_NATIVE_PCM_CHANNELS)
      );
      this.pcm = new Float32Array(
        FE_NATIVE_PCM_TRANSPORT_FRAMES * FE_NATIVE_PCM_CHANNELS
      );
      this.framesWritten = 0;
      this.inputEnergy = 0;
      this.blocksWritten += 1;
      this.port.postMessage({
        type: 'pcm',
        pcm: block,
        frames: FE_NATIVE_PCM_TRANSPORT_FRAMES,
        blocks: this.blocksWritten,
        inputRms
      }, [block.buffer]);
      if (
        this.blocksWritten === 1
        || this.blocksWritten % FE_NATIVE_PCM_METRICS_INTERVAL === 0
      ) {
        this.port.postMessage({
          type: 'metrics',
          processedBlocks: this.blocksWritten,
          inputRms
        });
      }
    }
    return true;
  }
}

registerProcessor('fe-native-pcm-bridge', FeNativePcmBridgeProcessor);
