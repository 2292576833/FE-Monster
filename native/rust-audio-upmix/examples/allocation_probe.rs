use fe_monster_upmix::{
    FeRustUpmixConfig, fe_rust_upmix_create, fe_rust_upmix_destroy,
    fe_rust_upmix_process, fe_rust_upmix_reset,
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

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let result = unsafe { System.realloc(pointer, layout, new_size) };
        if TRACKING.load(Ordering::Relaxed) && !result.is_null() {
            REALLOCATIONS.fetch_add(1, Ordering::Relaxed);
            ALLOCATED_BYTES.fetch_add(new_size as u64, Ordering::Relaxed);
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
    let output_channels = argument(1, 6);
    let algorithm = argument(2, 1);
    let iterations = argument(3, 20).max(1);
    let frames = 4096_u32;
    let config = FeRustUpmixConfig {
        struct_size: size_of::<FeRustUpmixConfig>() as u32,
        abi_version: 1,
        sample_rate: 48_000,
        output_channels,
        algorithm,
        center_width_hz: 300.0,
        lfe_crossover_hz: 120.0,
        lfe_gain: 0.707,
        center_gain: 0.707,
        surround_gain: 0.5,
        decorrelation_amount: 0.7,
    };
    let handle = unsafe { fe_rust_upmix_create(&config) };
    if handle.is_null() {
        panic!("unable to create upmix handle");
    }

    let mut input = vec![0.0_f32; frames as usize * 2];
    for (frame, stereo) in input.chunks_exact_mut(2).enumerate() {
        let phase = frame as f32 * 83.0 * std::f32::consts::TAU / 48_000.0;
        stereo[0] = phase.sin() * 0.12;
        stereo[1] = (phase * 1.013 + 0.27).sin() * 0.10;
    }
    let mut output = vec![0.0_f32; frames as usize * output_channels as usize];

    let warmup_result = unsafe {
        fe_rust_upmix_process(
            handle,
            input.as_ptr(),
            frames,
            output.as_mut_ptr(),
            output.len() as u32,
        )
    };
    if warmup_result != 0 {
        unsafe { fe_rust_upmix_destroy(handle) };
        panic!("warmup failed: {warmup_result}");
    }
    let _ = unsafe { fe_rust_upmix_reset(handle) };

    ALLOCATIONS.store(0, Ordering::Relaxed);
    REALLOCATIONS.store(0, Ordering::Relaxed);
    DEALLOCATIONS.store(0, Ordering::Relaxed);
    ALLOCATED_BYTES.store(0, Ordering::Relaxed);
    let started = Instant::now();
    TRACKING.store(true, Ordering::SeqCst);
    let mut result = 0;
    for _ in 0..iterations {
        result = unsafe {
            fe_rust_upmix_process(
                handle,
                input.as_ptr(),
                frames,
                output.as_mut_ptr(),
                output.len() as u32,
            )
        };
        if result != 0 {
            break;
        }
    }
    TRACKING.store(false, Ordering::SeqCst);
    let elapsed_micros = started.elapsed().as_micros();

    let allocations = ALLOCATIONS.load(Ordering::Relaxed);
    let reallocations = REALLOCATIONS.load(Ordering::Relaxed);
    let deallocations = DEALLOCATIONS.load(Ordering::Relaxed);
    let allocated_bytes = ALLOCATED_BYTES.load(Ordering::Relaxed);
    unsafe { fe_rust_upmix_destroy(handle) };
    println!(
        "{{\"result\":{result},\"frames\":{frames},\"channels\":{output_channels},\"algorithm\":{algorithm},\"iterations\":{iterations},\"allocations\":{allocations},\"reallocations\":{reallocations},\"deallocations\":{deallocations},\"allocatedBytes\":{allocated_bytes},\"elapsedMicros\":{elapsed_micros},\"allocationsPerCall\":{:.2},\"bytesPerCall\":{:.2},\"microsPerCall\":{:.2}}}",
        allocations as f64 / iterations as f64,
        allocated_bytes as f64 / iterations as f64,
        elapsed_micros as f64 / iterations as f64,
    );
    if result != 0 {
        std::process::exit(1);
    }
}
