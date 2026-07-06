package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public final class GestureControlService {
    private final ProjectPaths paths;
    private final Path script;
    private Process process;
    private String state = "stopped";
    private String message = "Gesture control is off.";
    private String lastAction = "";
    private String lastDetail = "";
    private String activeCameraSource = "";
    private long lastEventAt = 0L;

    public GestureControlService(ProjectPaths paths) {
        this.paths = paths;
        this.script = paths.root.resolve("scripts").resolve("gesture_control.py").toAbsolutePath().normalize();
    }

    public synchronized Map<String, Object> applyEnabled(boolean enabled, String cameraSource) {
        String normalizedSource = normalizeCameraSource(cameraSource);
        if (enabled) {
            startLocked(normalizedSource);
        } else {
            stopLocked("Gesture control is off.");
        }
        return status(enabled, normalizedSource);
    }

    public synchronized Map<String, Object> status(boolean enabled, String cameraSource) {
        String normalizedSource = normalizeCameraSource(cameraSource);
        boolean running = process != null && process.isAlive();
        if (!running && process != null) process = null;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("enabled", enabled);
        body.put("cameraSource", running && !activeCameraSource.isBlank() ? activeCameraSource : normalizedSource);
        body.put("running", running);
        body.put("state", running ? state : (enabled ? state : "stopped"));
        body.put("message", running ? message : (enabled ? message : "Gesture control is off."));
        body.put("lastAction", lastAction);
        body.put("detail", lastDetail);
        body.put("lastEventAt", lastEventAt);
        body.put("script", script.toString());
        if (running) body.put("pid", process.pid());
        return body;
    }

    public synchronized void stop() {
        stopLocked("Gesture camera closed.");
    }

    private void startLocked(String cameraSource) {
        if (process != null && process.isAlive()) {
            if (!activeCameraSource.equals(cameraSource)) {
                stopLocked("Switching gesture camera source...");
            } else {
                state = "running";
                message = "Gesture control is already running.";
                return;
            }
        }
        if (!Files.isRegularFile(script)) {
            process = null;
            state = "script_missing";
            message = "Gesture script was not found.";
            lastDetail = script.toString();
            lastEventAt = System.currentTimeMillis();
            return;
        }

        IOException lastError = null;
        for (List<String> pythonCommand : pythonCandidates()) {
            List<String> command = new ArrayList<>(pythonCommand);
            command.add("-u");
            command.add(script.toString());
            command.add("--stability");
            command.add("0.30");
            command.add("--max-fps");
            command.add("30");
            command.add("--camera-index");
            command.add(setting("FE_GESTURE_CAMERA_INDEX", "fe.gesture.cameraIndex", "0"));
            command.add("--camera-scan");
            command.add(setting("FE_GESTURE_CAMERA_SCAN", "fe.gesture.cameraScan", "camera".equals(cameraSource) ? "12" : "4"));
            command.add("--camera-name");
            command.add(setting("FE_GESTURE_CAMERA_NAME", "fe.gesture.cameraName", "camera".equals(cameraSource) ? "canon,eos,webcam utility" : ""));

            ProcessBuilder builder = new ProcessBuilder(command);
            builder.directory(paths.root.toFile());
            builder.redirectErrorStream(true);
            builder.environment().put("PYTHONUNBUFFERED", "1");
            builder.environment().put("PYTHONIOENCODING", "utf-8");
            applyBundledPythonEnvironment(builder);

            try {
                process = builder.start();
                activeCameraSource = cameraSource;
                state = "starting";
                message = "Opening camera for gesture control...";
                lastDetail = String.join(" ", command);
                lastEventAt = System.currentTimeMillis();
                startReaderThread(process);
                return;
            } catch (IOException error) {
                lastError = error;
            }
        }

        process = null;
        state = "python_unavailable";
        message = "Python could not be started.";
        lastDetail = lastError == null ? "" : lastError.getMessage();
        lastEventAt = System.currentTimeMillis();
    }

    private void stopLocked(String nextMessage) {
        Process current = process;
        process = null;
        activeCameraSource = "";
        if (current != null && current.isAlive()) {
            current.destroy();
            try {
                if (!current.waitFor(2, TimeUnit.SECONDS)) {
                    current.destroyForcibly();
                }
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
                current.destroyForcibly();
            }
        }
        state = "stopped";
        message = nextMessage;
        lastEventAt = System.currentTimeMillis();
    }

    private void startReaderThread(Process startedProcess) {
        Thread reader = new Thread(() -> {
            try (BufferedReader input = new BufferedReader(new InputStreamReader(startedProcess.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = input.readLine()) != null) {
                    handleProcessLine(line);
                }
            } catch (IOException error) {
                synchronized (this) {
                    if (process == startedProcess) {
                        state = "read_failed";
                        message = "Gesture status stream failed.";
                        lastDetail = error.getMessage();
                        lastEventAt = System.currentTimeMillis();
                    }
                }
            } finally {
                int exitCode = 0;
                try {
                    exitCode = startedProcess.waitFor();
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                synchronized (this) {
                    if (process == startedProcess) {
                        process = null;
                        if (!"dependency_missing".equals(state) && !"camera_unavailable".equals(state) && !"runtime_error".equals(state)) {
                            state = exitCode == 0 ? "stopped" : "exited";
                            message = exitCode == 0 ? "Gesture camera closed." : "Gesture control exited.";
                            lastDetail = "exitCode=" + exitCode;
                        }
                        lastEventAt = System.currentTimeMillis();
                    }
                }
            }
        }, "fe-monster-gesture-reader");
        reader.setDaemon(true);
        reader.start();
    }

    private synchronized void handleProcessLine(String line) {
        Map<String, Object> event;
        try {
            event = SimpleJson.parseObject(line);
        } catch (RuntimeException ignored) {
            event = new LinkedHashMap<>();
        }
        if (event.isEmpty()) {
            lastDetail = line;
            lastEventAt = System.currentTimeMillis();
            return;
        }

        String eventType = SimpleJson.asString(event.get("event"), "");
        String nextState = SimpleJson.asString(event.get("state"), "");
        String nextMessage = SimpleJson.asString(event.get("message"), "");
        String action = SimpleJson.asString(event.get("action"), "");
        String detail = SimpleJson.asString(event.get("detail"), "");

        if (!nextState.isBlank()) state = nextState;
        else if ("error".equals(eventType)) state = "runtime_error";
        else if ("action".equals(eventType)) state = "running";
        else if ("status".equals(eventType) && (process != null && process.isAlive())) state = "running";

        if (!nextMessage.isBlank()) message = nextMessage;
        if (!action.isBlank()) lastAction = action;
        if (!detail.isBlank()) lastDetail = detail;
        lastEventAt = System.currentTimeMillis();
    }

    private List<List<String>> pythonCandidates() {
        List<List<String>> candidates = new ArrayList<>();
        String override = System.getenv("FE_GESTURE_PYTHON");
        if (override != null && !override.isBlank()) {
            candidates.add(List.of(override.trim()));
        }
        Path bundledPython = paths.root.resolve("runtime").resolve("python").resolve("python.exe").toAbsolutePath().normalize();
        if (Files.isRegularFile(bundledPython)) {
            candidates.add(List.of(bundledPython.toString()));
        }
        Path localWindowsPython = paths.root.resolve(".venv-gesture").resolve("Scripts").resolve("python.exe").toAbsolutePath().normalize();
        if (Files.isRegularFile(localWindowsPython)) {
            candidates.add(List.of(localWindowsPython.toString()));
        }
        Path localUnixPython = paths.root.resolve(".venv-gesture").resolve("bin").resolve("python").toAbsolutePath().normalize();
        if (Files.isRegularFile(localUnixPython)) {
            candidates.add(List.of(localUnixPython.toString()));
        }
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        candidates.add(List.of("python"));
        if (os.contains("win")) candidates.add(Arrays.asList("py", "-3"));
        candidates.add(List.of("python3"));
        return candidates;
    }

    private void applyBundledPythonEnvironment(ProcessBuilder builder) {
        Path bundledRoot = paths.root.resolve("runtime").resolve("python").toAbsolutePath().normalize();
        Path bundledSitePackages = paths.root.resolve("runtime").resolve("python-site-packages").toAbsolutePath().normalize();
        if (!Files.isDirectory(bundledSitePackages)) return;

        Map<String, String> env = builder.environment();
        String existingPythonPath = env.getOrDefault("PYTHONPATH", "");
        env.put("PYTHONPATH", existingPythonPath == null || existingPythonPath.isBlank()
            ? bundledSitePackages.toString()
            : bundledSitePackages + System.getProperty("path.separator") + existingPythonPath);
        env.put("PYTHONNOUSERSITE", "1");

        List<String> pathEntries = new ArrayList<>();
        if (Files.isDirectory(bundledRoot)) pathEntries.add(bundledRoot.toString());
        Path bundledDlls = bundledRoot.resolve("DLLs");
        if (Files.isDirectory(bundledDlls)) pathEntries.add(bundledDlls.toString());
        pathEntries.add(bundledSitePackages.toString());
        Path cv2Path = bundledSitePackages.resolve("cv2");
        if (Files.isDirectory(cv2Path)) pathEntries.add(cv2Path.toString());
        Path numpyLibs = bundledSitePackages.resolve("numpy.libs");
        if (Files.isDirectory(numpyLibs)) pathEntries.add(numpyLibs.toString());

        String existingPath = env.getOrDefault("PATH", "");
        env.put("PATH", String.join(System.getProperty("path.separator"), pathEntries) +
            (existingPath == null || existingPath.isBlank() ? "" : System.getProperty("path.separator") + existingPath));
    }

    private static String normalizeCameraSource(String cameraSource) {
        if (cameraSource == null) return "webcam";
        String normalized = cameraSource.trim().toLowerCase(Locale.ROOT);
        return "camera".equals(normalized) || "canon".equals(normalized) || "eos".equals(normalized) ? "camera" : "webcam";
    }

    private static String setting(String envName, String propertyName, String fallback) {
        String envValue = System.getenv(envName);
        if (envValue != null && !envValue.isBlank()) return envValue.trim();
        String propertyValue = System.getProperty(propertyName);
        if (propertyValue != null && !propertyValue.isBlank()) return propertyValue.trim();
        return fallback;
    }
}
