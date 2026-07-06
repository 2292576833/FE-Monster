#!/usr/bin/env python3
import argparse
import json
import math
import os
import sys
import time


def emit(event, **payload):
    body = {"event": event, "time": time.time()}
    body.update(payload)
    print(json.dumps(body, ensure_ascii=False), flush=True)


try:
    import cv2
    import mediapipe as mp
    import pyautogui
except Exception as error:
    emit(
        "error",
        state="dependency_missing",
        message=(
            "Missing gesture dependency. Install with: "
            "python -m pip install -r scripts/gesture-requirements.txt"
        ),
        detail=str(error),
    )
    sys.exit(2)


TIP_IDS = [4, 8, 12, 16, 20]
FINGER_TIPS = {
    "thumb": 4,
    "index": 8,
    "middle": 12,
    "ring": 16,
    "pinky": 20,
}
FINGER_PIPS = {
    "index": 6,
    "middle": 10,
    "ring": 14,
    "pinky": 18,
}


def env_int(name, fallback):
    try:
        return int(os.environ.get(name, "").strip() or fallback)
    except ValueError:
        return fallback


def parse_args():
    parser = argparse.ArgumentParser(description="FE Monster camera gesture control")
    parser.add_argument("--camera-index", type=int, default=env_int("FE_GESTURE_CAMERA_INDEX", 0))
    parser.add_argument("--camera-scan", type=int, default=env_int("FE_GESTURE_CAMERA_SCAN", 12))
    parser.add_argument("--camera-name", default=os.environ.get("FE_GESTURE_CAMERA_NAME", "canon,eos,webcam utility"))
    parser.add_argument("--stability", type=float, default=0.30)
    parser.add_argument("--max-fps", type=float, default=30.0)
    parser.add_argument("--pinch-threshold", type=float, default=0.045)
    parser.add_argument("--five-pinch-threshold", type=float, default=0.115)
    parser.add_argument("--arm-seconds", type=float, default=6.0)
    parser.add_argument("--hotkey", default="ctrl+tab")
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--probe", action="store_true")
    return parser.parse_args()


def distance(points, a, b):
    ax, ay = points[a]
    bx, by = points[b]
    return math.hypot(ax - bx, ay - by)


def max_pair_distance(points, ids):
    biggest = 0.0
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            biggest = max(biggest, distance(points, a, b))
    return biggest


def clamp(value, low, high):
    return max(low, min(high, value))


class StableTracker:
    def __init__(self):
        self.since = {}

    def active(self, name, is_active, now, seconds):
        if is_active:
            self.since.setdefault(name, now)
            return now - self.since[name] >= seconds
        self.since.pop(name, None)
        return False

    def reset(self, name):
        self.since.pop(name, None)


def fingers_up(points):
    states = {}
    wrist_distance = distance(points, 0, 9)
    states["thumb"] = distance(points, 0, 4) > distance(points, 0, 3) * 1.08 and distance(points, 4, 5) > wrist_distance * 0.34
    for name, tip in FINGER_TIPS.items():
        if name == "thumb":
            continue
        pip = FINGER_PIPS[name]
        states[name] = points[tip][1] < points[pip][1] and distance(points, 0, tip) > distance(points, 0, pip)
    return states


def hotkey_parts(raw):
    keys = [part.strip().lower() for part in raw.split("+") if part.strip()]
    return keys or ["ctrl", "tab"]


def camera_backends():
    if sys.platform.startswith("win"):
        return [
            ("DirectShow", cv2.CAP_DSHOW),
            ("MSMF", cv2.CAP_MSMF),
            ("Auto", cv2.CAP_ANY),
        ]
    return [("Auto", cv2.CAP_ANY)]


def directshow_device_names():
    if not sys.platform.startswith("win"):
        return [], ""
    try:
        from pygrabber.dshow_graph import FilterGraph
        return list(FilterGraph().get_input_devices()), ""
    except Exception as error:
        return [], f"device-name-list-unavailable:{error}"


def camera_name_tokens(raw):
    return [token.strip().lower() for token in raw.split(",") if token.strip()]


def camera_indexes(preferred, scan_count, preferred_names, device_names):
    indexes = []
    tokens = camera_name_tokens(preferred_names)
    if tokens:
        for index, name in enumerate(device_names):
            lowered = name.lower()
            if any(token in lowered for token in tokens):
                indexes.append(index)
    if preferred >= 0:
        indexes.append(preferred)
    indexes.extend(range(max(0, scan_count + 1)))
    indexes.extend(range(len(device_names)))
    seen = set()
    ordered = []
    for index in indexes:
        if index in seen:
            continue
        seen.add(index)
        ordered.append(index)
    return ordered


def try_camera(index, backend_name, backend, device_name=""):
    if sys.platform.startswith("win"):
        cap = cv2.VideoCapture(index, backend)
    else:
        cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        cap.release()
        return None, "not-opened"
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    if hasattr(cv2, "CAP_PROP_BUFFERSIZE"):
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    for _ in range(8):
        ok, frame = cap.read()
        if ok and frame is not None:
            detail = f"index={index}, backend={backend_name}"
            if device_name:
                detail += f", device={device_name}"
            return cap, detail
        time.sleep(0.05)
    cap.release()
    return None, "no-frame"


def open_camera(index, scan_count, preferred_names):
    attempts = []
    device_names, device_list_detail = directshow_device_names()
    for camera_index in camera_indexes(index, scan_count, preferred_names, device_names):
        device_name = device_names[camera_index] if 0 <= camera_index < len(device_names) else ""
        for backend_name, backend in camera_backends():
            cap, detail = try_camera(camera_index, backend_name, backend, device_name)
            label = f"{camera_index}:{device_name}" if device_name else str(camera_index)
            attempts.append(f"{label}/{backend_name}:{detail}")
            if cap is not None:
                return cap, detail, attempts, device_names, device_list_detail
    return None, "", attempts, device_names, device_list_detail


def main():
    args = parse_args()
    try:
        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0
        screen_w, screen_h = pyautogui.size()
    except Exception as error:
        emit("error", state="screen_unavailable", message="Could not access screen control.", detail=str(error))
        return 3

    cap, camera_detail, camera_attempts, camera_devices, camera_device_detail = open_camera(
        args.camera_index,
        args.camera_scan,
        args.camera_name,
    )
    if cap is None or not cap.isOpened():
        device_detail = ""
        if camera_devices:
            device_detail = " | devices=" + ", ".join(f"{index}:{name}" for index, name in enumerate(camera_devices))
        elif camera_device_detail:
            device_detail = " | " + camera_device_detail
        emit(
            "error",
            state="camera_unavailable",
            message="无法打开摄像头，请检查系统相机权限，或关闭正在占用摄像头的软件。",
            detail="; ".join(camera_attempts) + device_detail,
        )
        return 4

    emit("status", state="camera_open", message="摄像头已打开。", running=True, detail=camera_detail)
    if args.probe:
        cap.release()
        emit("status", state="camera_probe_ok", message="摄像头探测成功。", running=False, detail=camera_detail)
        return 0

    tracker = StableTracker()
    mp_hands = mp.solutions.hands
    hotkey = hotkey_parts(args.hotkey)
    armed_until = 0.0
    last_action_at = {}
    last_status_at = 0.0
    last_scroll_y = None
    zoom_pinch_seen = False
    mouse_x = screen_w / 2
    mouse_y = screen_h / 2

    def cooled(name, now, seconds):
        if now - last_action_at.get(name, 0.0) < seconds:
            return False
        last_action_at[name] = now
        return True

    try:
        with mp_hands.Hands(
            max_num_hands=1,
            model_complexity=0,
            min_detection_confidence=0.65,
            min_tracking_confidence=0.55,
        ) as hands:
            while True:
                frame_start = time.time()
                ok, frame = cap.read()
                if not ok:
                    emit("error", state="camera_read_failed", message="Camera frame read failed.")
                    return 5

                frame = cv2.flip(frame, 1)
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = hands.process(rgb)
                now = time.time()
                hand_label = "none"
                armed = now < armed_until

                if result.multi_hand_landmarks:
                    landmarks = result.multi_hand_landmarks[0].landmark
                    points = [(lm.x, lm.y) for lm in landmarks]
                    up = fingers_up(points)
                    up_count = sum(1 for value in up.values() if value)
                    open_palm = up_count == 5 and max_pair_distance(points, TIP_IDS) > 0.22
                    fist = up_count == 0
                    pinch = distance(points, 4, 8) < args.pinch_threshold
                    index_only = up["index"] and not up["middle"] and not up["ring"] and not up["pinky"]
                    four_up = up["index"] and up["middle"] and up["ring"] and up["pinky"]
                    four_tips = [points[i] for i in [8, 12, 16, 20]]
                    four_together = four_up and (max(x for x, _ in four_tips) - min(x for x, _ in four_tips) < 0.14)
                    five_pinch = max_pair_distance(points, TIP_IDS) < args.five_pinch_threshold
                    shortcut_pose = up["index"] and up["middle"] and up["ring"] and not up["pinky"] and not up["thumb"]

                    if tracker.active("open_palm", open_palm, now, args.stability):
                        armed_until = now + args.arm_seconds
                        armed = True
                        hand_label = "armed"
                        if zoom_pinch_seen and cooled("zoom_in", now, 0.8):
                            pyautogui.hotkey("ctrl", "=")
                            zoom_pinch_seen = False
                            emit("action", action="zoom_in", message="Zoom in")

                    if tracker.active("fist", fist, now, args.stability):
                        armed_until = 0.0
                        armed = False
                        zoom_pinch_seen = False
                        hand_label = "paused"

                    if armed:
                        if tracker.active("move", index_only and not pinch, now, 0.12):
                            target_x = clamp(points[8][0], 0.02, 0.98) * screen_w
                            target_y = clamp(points[8][1], 0.02, 0.98) * screen_h
                            mouse_x = mouse_x * 0.68 + target_x * 0.32
                            mouse_y = mouse_y * 0.68 + target_y * 0.32
                            pyautogui.moveTo(mouse_x, mouse_y, duration=0)
                            hand_label = "move"

                        if tracker.active("click", pinch and up["index"], now, args.stability) and cooled("click", now, 0.55):
                            pyautogui.click()
                            tracker.reset("click")
                            hand_label = "click"
                            emit("action", action="click", message="Mouse click")

                        if tracker.active("scroll", four_together and not pinch, now, args.stability):
                            center_y = sum(y for _, y in four_tips) / 4
                            if last_scroll_y is None:
                                last_scroll_y = center_y
                            delta = center_y - last_scroll_y
                            if abs(delta) > 0.028 and cooled("scroll", now, 0.10):
                                amount = int(clamp(-delta * 2800, -9, 9))
                                if amount != 0:
                                    pyautogui.scroll(amount)
                                    last_scroll_y = center_y
                                    hand_label = "scroll"
                                    emit("action", action="scroll", amount=amount, message="Mouse wheel scroll")
                        else:
                            last_scroll_y = None

                        if tracker.active("zoom_out", five_pinch, now, args.stability) and cooled("zoom_out", now, 0.8):
                            pyautogui.hotkey("ctrl", "-")
                            tracker.reset("zoom_out")
                            zoom_pinch_seen = True
                            hand_label = "zoom_out"
                            emit("action", action="zoom_out", message="Zoom out")

                        if tracker.active("hotkey", shortcut_pose, now, args.stability) and cooled("hotkey", now, 1.2):
                            pyautogui.hotkey(*hotkey)
                            tracker.reset("hotkey")
                            hand_label = "hotkey"
                            emit("action", action="hotkey", hotkey="+".join(hotkey), message="Shortcut executed")
                    else:
                        last_scroll_y = None

                if now - last_status_at > 1.0:
                    last_status_at = now
                    emit(
                        "status",
                        state="running",
                        message="Gesture control running.",
                        running=True,
                        armed=armed,
                        hand=hand_label,
                    )

                if args.preview:
                    cv2.imshow("FE Monster Gestures", frame)
                    if cv2.waitKey(1) & 0xFF == 27:
                        break

                elapsed = time.time() - frame_start
                delay = max(0.0, (1.0 / max(1.0, args.max_fps)) - elapsed)
                if delay:
                    time.sleep(delay)
    except KeyboardInterrupt:
        emit("status", state="stopping", message="Gesture control interrupted.", running=False)
    except Exception as error:
        emit("error", state="runtime_error", message="Gesture control failed.", detail=str(error))
        return 6
    finally:
        cap.release()
        if args.preview:
            cv2.destroyAllWindows()
        emit("status", state="stopped", message="Gesture camera closed.", running=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
