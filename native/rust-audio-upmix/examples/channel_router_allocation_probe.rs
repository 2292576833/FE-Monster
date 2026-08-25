use fe_monster_upmix::channel_router::{
    ALGORITHM_MATRIX_DECODE, ALGORITHM_MUSIC_DETAIL, ChannelRouter, RESULT_OK, RouterConfig,
    RouterParams,
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
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(fallback)
}

fn main() {
    let algorithm = argument(1, ALGORITHM_MUSIC_DETAIL);
    let channels = argument(2, 8);
    let iterations = argument(3, 2_000).max(100) as usize;
    let frames = 256_usize;
    if !matches!(algorithm, ALGORITHM_MATRIX_DECODE | ALGORITHM_MUSIC_DETAIL) {
        panic!("probe supports allocation-free matrix or music-detail paths");
    }

    let config = RouterConfig {
        output_channels: channels,
        max_frames_per_call: frames as u32,
        ..Default::default()
    };
    let mut router = ChannelRouter::new(&config).expect("unable to create channel router");
    let mut params = RouterParams::front_only(channels);
    params.algorithm = algorithm;
    params.lfe_crossover_hz = 120.0;
    assert_eq!(router.stage(1, &params), RESULT_OK);
    assert_eq!(router.commit(1, 0), RESULT_OK);

    let input: Vec<f32> = (0..frames)
        .flat_map(|frame| {
            let time = frame as f32 / 48_000.0;
            let vocal = (std::f32::consts::TAU * 997.0 * time).sin() * 0.14;
            let bass = (std::f32::consts::TAU * 73.0 * time).sin() * 0.10;
            let detail = (std::f32::consts::TAU * 3_200.0 * time).sin() * 0.06;
            [vocal + bass + detail, vocal + bass - detail]
        })
        .collect();
    let mut output = vec![0.0_f32; frames * channels as usize];
    assert_eq!(router.process(&input, frames, &mut output), RESULT_OK);

    let mut timings_nanos = vec![0_u64; iterations];
    ALLOCATIONS.store(0, Ordering::Relaxed);
    REALLOCATIONS.store(0, Ordering::Relaxed);
    DEALLOCATIONS.store(0, Ordering::Relaxed);
    ALLOCATED_BYTES.store(0, Ordering::Relaxed);
    let mut result = RESULT_OK;
    TRACKING.store(true, Ordering::SeqCst);
    for timing in &mut timings_nanos {
        let started = Instant::now();
        result = router.process(&input, frames, &mut output);
        *timing = started.elapsed().as_nanos().min(u64::MAX as u128) as u64;
        if result != RESULT_OK {
            break;
        }
    }
    TRACKING.store(false, Ordering::SeqCst);

    timings_nanos.sort_unstable();
    let p99_index = ((iterations - 1) as f64 * 0.99).round() as usize;
    let p99_micros = timings_nanos[p99_index] as f64 / 1_000.0;
    let median_micros = timings_nanos[iterations / 2] as f64 / 1_000.0;
    let maximum_micros = timings_nanos[iterations - 1] as f64 / 1_000.0;
    let allocations = ALLOCATIONS.load(Ordering::Relaxed);
    let reallocations = REALLOCATIONS.load(Ordering::Relaxed);
    let deallocations = DEALLOCATIONS.load(Ordering::Relaxed);
    let allocated_bytes = ALLOCATED_BYTES.load(Ordering::Relaxed);
    let block_budget_micros = frames as f64 * 1_000_000.0 / config.sample_rate as f64;
    let output_checksum: f64 = output.iter().map(|sample| sample.abs() as f64).sum();

    println!(
        "{{\"result\":{result},\"algorithm\":{algorithm},\"frames\":{frames},\"channels\":{channels},\"iterations\":{iterations},\"allocations\":{allocations},\"reallocations\":{reallocations},\"deallocations\":{deallocations},\"allocatedBytes\":{allocated_bytes},\"medianMicros\":{median_micros:.3},\"p99Micros\":{p99_micros:.3},\"maximumMicros\":{maximum_micros:.3},\"blockBudgetMicros\":{block_budget_micros:.3},\"outputChecksum\":{output_checksum:.6}}}"
    );
    if result != RESULT_OK
        || allocations != 0
        || reallocations != 0
        || deallocations != 0
        || allocated_bytes != 0
        || p99_micros >= block_budget_micros
        || !output_checksum.is_finite()
        || output_checksum <= 0.0
    {
        std::process::exit(1);
    }
}
