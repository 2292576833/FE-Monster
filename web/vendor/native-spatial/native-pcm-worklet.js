// The transport batch is intentionally larger than OBR's 256-frame render
// quantum. This lowers MessagePort/HTTP/JNI overhead without changing the
// renderer's convolution size or XAudio2 scheduling granularity.
const FE_NATIVE_PCM_TRANSPORT_FRAMES = 4096;
const FE_NATIVE_PCM_CHANNELS = 2;
const FE_NATIVE_PCM_METRICS_INTERVAL = 3;
// current capture + active upload + four queued uploads leaves six buffers
// concurrently owned. Two spare slots absorb MessagePort return latency without
// allocating on the real-time thread.
const FE_NATIVE_PCM_BUFFER_POOL_SIZE = 8;
const FE_NATIVE_PCM_SAMPLES_PER_BLOCK =
  FE_NATIVE_PCM_TRANSPORT_FRAMES * FE_NATIVE_PCM_CHANNELS;

class FeNativePcmBridgeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = false;
    this.framesWritten = 0;
    this.blocksWritten = 0;
    this.inputEnergy = 0;
    this.timelineEpoch = 1;
    this.timelineFadeFrames = 0;
    this.timelineFadeCursor = 0;
    this.poolEpoch = 1;
    this.poolSlots = [];
    this.freeSlotIds = [];
    this.currentSlotId = -1;
    this.pcm = null;
    this.poolStarvedFrames = 0;
    this.nextStarvationMetricFrame = FE_NATIVE_PCM_TRANSPORT_FRAMES;
    this.allocatePool();
    this.port.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === 'recycle-pcm') {
        this.recyclePcm(message);
        return;
      }
      if (message.type === 'reset-timeline') {
        this.resetTimeline(message);
        return;
      }
      if (message.type !== 'set-enabled') return;
      const nextEnabled = message.enabled === true;
      if (nextEnabled === this.enabled) return;
      this.enabled = nextEnabled;
      if (this.enabled) {
        if (this.poolSlots.length === 0) this.allocatePool();
      } else {
        this.framesWritten = 0;
        this.inputEnergy = 0;
        this.poolStarvedFrames = 0;
        this.nextStarvationMetricFrame = FE_NATIVE_PCM_TRANSPORT_FRAMES;
        this.poolEpoch += 1;
        this.poolSlots = [];
        this.freeSlotIds = [];
        this.currentSlotId = -1;
        this.pcm = null;
      }
    };
    this.port.postMessage({
      type: 'ready',
      backend: 'native-rust-x3d-obr-xaudio2',
      sampleRate,
      bufferPoolSize: FE_NATIVE_PCM_BUFFER_POOL_SIZE,
      poolEpoch: this.poolEpoch
    });
  }

  resetTimeline(message) {
    const requestedEpoch = Number(message.timelineEpoch);
    if (!Number.isInteger(requestedEpoch) || requestedEpoch <= this.timelineEpoch) return;
    const requestedFadeFrames = Number(message.fadeFrames);
    this.timelineEpoch = requestedEpoch;
    this.framesWritten = 0;
    this.inputEnergy = 0;
    this.timelineFadeFrames = Number.isFinite(requestedFadeFrames)
      ? Math.max(0, Math.min(FE_NATIVE_PCM_TRANSPORT_FRAMES, Math.round(requestedFadeFrames)))
      : Math.max(1, Math.round(sampleRate * 0.015));
    this.timelineFadeCursor = 0;
    this.port.postMessage({
      type: 'timeline-reset',
      timelineEpoch: this.timelineEpoch,
      fadeFrames: this.timelineFadeFrames
    });
  }

  allocatePool() {
    this.poolSlots = new Array(FE_NATIVE_PCM_BUFFER_POOL_SIZE);
    this.freeSlotIds = new Array(FE_NATIVE_PCM_BUFFER_POOL_SIZE);
    for (let id = 0; id < FE_NATIVE_PCM_BUFFER_POOL_SIZE; id += 1) {
      this.poolSlots[id] = {
        pcm: new Float32Array(FE_NATIVE_PCM_SAMPLES_PER_BLOCK),
        state: 'free'
      };
      this.freeSlotIds[id] = FE_NATIVE_PCM_BUFFER_POOL_SIZE - id - 1;
    }
    this.currentSlotId = -1;
    this.pcm = null;
    this.acquireCaptureSlot();
  }

  acquireCaptureSlot() {
    if (this.currentSlotId >= 0 || this.freeSlotIds.length === 0) return false;
    const id = this.freeSlotIds.pop();
    const slot = this.poolSlots[id];
    if (!slot || slot.state !== 'free' || !(slot.pcm instanceof Float32Array)) {
      return false;
    }
    slot.state = 'capture';
    this.currentSlotId = id;
    this.pcm = slot.pcm;
    return true;
  }

  recyclePcm(message) {
    if (!this.enabled || message.poolEpoch !== this.poolEpoch) return;
    const id = message.bufferId;
    if (!Number.isInteger(id) || id < 0 || id >= this.poolSlots.length) return;
    const pcm = message.pcm;
    if (
      !(pcm instanceof Float32Array)
      || pcm.byteLength !== FE_NATIVE_PCM_SAMPLES_PER_BLOCK * Float32Array.BYTES_PER_ELEMENT
    ) return;
    const slot = this.poolSlots[id];
    if (!slot || slot.state !== 'in-flight') return;
    slot.pcm = pcm;
    slot.state = 'free';
    this.freeSlotIds.push(id);
    this.acquireCaptureSlot();
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
    if (!(this.pcm instanceof Float32Array)) {
      this.poolStarvedFrames += frameCount;
      if (this.poolStarvedFrames >= this.nextStarvationMetricFrame) {
        this.nextStarvationMetricFrame = this.poolStarvedFrames
          + FE_NATIVE_PCM_TRANSPORT_FRAMES;
        this.port.postMessage({
          type: 'metrics',
          processedBlocks: this.blocksWritten,
          inputRms: 0,
          poolStarvedFrames: this.poolStarvedFrames
        });
      }
      return true;
    }

    for (let frame = 0; frame < frameCount; frame += 1) {
      const leftSample = Number.isFinite(left[frame]) ? left[frame] : 0;
      const rightSample = Number.isFinite(right?.[frame])
        ? right[frame]
        : leftSample;
      const fadeGain = this.timelineFadeCursor < this.timelineFadeFrames
        ? Math.sin(
          (Math.PI * 0.5 * this.timelineFadeCursor)
            / Math.max(1, this.timelineFadeFrames - 1)
        )
        : 1;
      if (this.timelineFadeCursor < this.timelineFadeFrames) {
        this.timelineFadeCursor += 1;
      }
      const writeIndex = this.framesWritten * FE_NATIVE_PCM_CHANNELS;
      const fadedLeft = leftSample * fadeGain;
      const fadedRight = rightSample * fadeGain;
      this.pcm[writeIndex] = fadedLeft;
      this.pcm[writeIndex + 1] = fadedRight;
      this.inputEnergy += fadedLeft * fadedLeft + fadedRight * fadedRight;
      this.framesWritten += 1;

      if (this.framesWritten !== FE_NATIVE_PCM_TRANSPORT_FRAMES) continue;
      const block = this.pcm;
      const bufferId = this.currentSlotId;
      const slot = this.poolSlots[bufferId];
      const inputRms = Math.sqrt(
        this.inputEnergy
          / (FE_NATIVE_PCM_TRANSPORT_FRAMES * FE_NATIVE_PCM_CHANNELS)
      );
      slot.pcm = null;
      slot.state = 'in-flight';
      this.currentSlotId = -1;
      this.pcm = null;
      this.framesWritten = 0;
      this.inputEnergy = 0;
      this.blocksWritten += 1;
      this.acquireCaptureSlot();
      this.port.postMessage({
        type: 'pcm',
        pcm: block,
        bufferId,
        poolEpoch: this.poolEpoch,
        timelineEpoch: this.timelineEpoch,
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
          inputRms,
          poolStarvedFrames: this.poolStarvedFrames
        });
      }
      if (!(this.pcm instanceof Float32Array)) {
        this.poolStarvedFrames += frameCount - frame - 1;
        if (this.poolStarvedFrames >= this.nextStarvationMetricFrame) {
          this.nextStarvationMetricFrame = this.poolStarvedFrames
            + FE_NATIVE_PCM_TRANSPORT_FRAMES;
          this.port.postMessage({
            type: 'metrics',
            processedBlocks: this.blocksWritten,
            inputRms,
            poolStarvedFrames: this.poolStarvedFrames
          });
        }
        break;
      }
    }
    return true;
  }
}

registerProcessor('fe-native-pcm-bridge', FeNativePcmBridgeProcessor);
