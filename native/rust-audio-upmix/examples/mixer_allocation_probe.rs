use fe_monster_upmix::{
    FeRustMixerConfig, FeRustMixerParams, fe_rust_mixer_commit, fe_rust_mixer_create,
    fe_rust_mixer_destroy, fe_rust_mixer_process, fe_rust_mixer_stage_params,
};
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Instant;

struct CountingAllocator;
static TRACKING: AtomicBool = AtomicBool::new(false);
static ALLOCATIONS: AtomicU64 = AtomicU64::new(0);
static REALLOCATIONS: AtomicU64 = AtomicU64::new(0);
static DEALLOCATIONS: AtomicU64 = AtomicU64::new(0);
static ALLOCATED_BYTES: AtomicU64 = AtomicU64::new(0);

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let result = unsafe { System.alloc(layout) };
        if TRACKING.load(Ordering::Relaxed) && !result.is_null() {
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
            ALLOCATED_BYTES.fetch_add(layout.size() as u64, Ordering::Relaxed);
        }
        result
    }
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        let result = unsafe { System.alloc_zeroed(layout) };
        if TRACKING.load(Ordering::Relaxed) && !result.is_null() {
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
            ALLOCATED_BYTES.fetch_add(layout.size() as u64, Ordering::Relaxed);
        }
        result
    }
    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        let result = unsafe { System.realloc(pointer, layout, size) };
        if TRACKING.load(Ordering::Relaxed) && !result.is_null() {
            REALLOCATIONS.fetch_add(1, Ordering::Relaxed);
            ALLOCATED_BYTES.fetch_add(size as u64, Ordering::Relaxed);
        }
        result
    }
    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        if TRACKING.load(Ordering::Relaxed) {
            DEALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        }
        unsafe { System.dealloc(pointer, layout) };
    }
}

#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

fn argument(index: usize, fallback: u32) -> u32 {
    std::env::args()
        .nth(index)
        .and_then(|v| v.parse().ok())
        .unwrap_or(fallback)
}

fn main() {
    let channels = argument(1, 8);
    let iterations = argument(2, 100).max(100);
    let frames = 4096_u32;
    let config = FeRustMixerConfig {
        max_frames_per_call: frames,
        ..Default::default()
    };
    let handle = unsafe { fe_rust_mixer_create(&config) };
    if handle.is_null() {
        panic!("unable to create mixer");
    }
    let mut params = FeRustMixerParams::default();
    params.eq_db = [1.0, -1.0, 2.0, -2.0, 1.5, 0.5, -0.5, 1.0, -1.0, 0.5];
    params.compressor_enabled = 1;
    params.reverb_enabled = 1;
    params.reverb_wet = 0.2;
    let mut pcm = vec![0.0_f32; frames as usize * channels as usize];
    for (frame, samples) in pcm.chunks_exact_mut(channels as usize).enumerate() {
        let value = (frame as f32 * 997.0 * std::f32::consts::TAU / 48_000.0).sin() * 0.2;
        samples.fill(value);
    }
    // Warm only the initial clean snapshot. Every measured process below is
    // deliberately the first callback after a newly prepared commit.
    let warmup = unsafe { fe_rust_mixer_process(handle, pcm.as_mut_ptr(), frames, channels) };
    if warmup != 0 {
        unsafe { fe_rust_mixer_destroy(handle) };
        panic!("warmup failed: {warmup}");
    }

    ALLOCATIONS.store(0, Ordering::Relaxed);
    REALLOCATIONS.store(0, Ordering::Relaxed);
    DEALLOCATIONS.store(0, Ordering::Relaxed);
    ALLOCATED_BYTES.store(0, Ordering::Relaxed);
    let mut result = 0;
    let mut elapsed = 0_u128;
    let mut maximum_process_micros = 0_u128;
    for iteration in 0..iterations {
        params.eq_db[0] = 1.0 + (iteration & 1) as f32 * 0.25;
        let revision = iteration as u64 + 1;
        let stage = unsafe { fe_rust_mixer_stage_params(handle, revision, &params) };
        let commit = unsafe { fe_rust_mixer_commit(handle, revision, 256) };
        if stage != 0 || commit != 0 {
            result = if stage != 0 { stage } else { commit };
            break;
        }
        let call_started = Instant::now();
        TRACKING.store(true, Ordering::SeqCst);
        result = unsafe { fe_rust_mixer_process(handle, pcm.as_mut_ptr(), frames, channels) };
        TRACKING.store(false, Ordering::SeqCst);
        let call_micros = call_started.elapsed().as_micros();
        elapsed += call_micros;
        maximum_process_micros = maximum_process_micros.max(call_micros);
        if result != 0 {
            break;
        }
    }
    let allocations = ALLOCATIONS.load(Ordering::Relaxed);
    let reallocations = REALLOCATIONS.load(Ordering::Relaxed);
    let deallocations = DEALLOCATIONS.load(Ordering::Relaxed);
    let bytes = ALLOCATED_BYTES.load(Ordering::Relaxed);
    let audio_block_real_time_budget_micros =
        frames as u128 * 1_000_000 / config.sample_rate as u128;
    let total_mixer_budget_micros = iterations as u128 * 20_000;
    let micros_per_call = elapsed as f64 / iterations as f64;
    unsafe { fe_rust_mixer_destroy(handle) };
    println!(
        "{{\"result\":{result},\"sampleRate\":{},\"frames\":{frames},\"channels\":{channels},\"iterations\":{iterations},\"measuredPoint\":\"first-process-after-each-commit\",\"allocations\":{allocations},\"reallocations\":{reallocations},\"deallocations\":{deallocations},\"allocatedBytes\":{bytes},\"totalProcessMicros\":{elapsed},\"averageProcessMicros\":{micros_per_call:.2},\"maximumProcessMicros\":{maximum_process_micros},\"mixerBudgetMicrosPerCall\":20000,\"totalMixerBudgetMicros\":{total_mixer_budget_micros},\"audioBlockRealTimeBudgetMicrosPerCall\":{audio_block_real_time_budget_micros}}}",
        config.sample_rate
    );
    if result != 0
        || allocations != 0
        || reallocations != 0
        || deallocations != 0
        || bytes != 0
        || elapsed > total_mixer_budget_micros
        || maximum_process_micros > 20_000
    {
        std::process::exit(1);
    }
}
