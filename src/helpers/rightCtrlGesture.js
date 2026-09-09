// Gesture timing is independent of desktop input and microphone implementation.
class RightCtrlGesture {
  constructor({
    start,
    stop,
    cancel,
    canStart = () => true,
    isRecording = () => false,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    holdMs = 200,
    doubleTapMs = 350,
    maxRecordingMs = 300000,
  }) {
    Object.assign(this, {
      start,
      stop,
      cancel,
      canStart,
      isRecording,
      setTimer,
      clearTimer,
      holdMs,
      doubleTapMs,
      maxRecordingMs,
    });
    this.state = "idle";
    this.pressed = false;
    this.ownsRecording = false;
    this.timer = null;
    this.safety = null;
  }
  clearPending() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }
  begin(state) {
    if (!this.canStart()) {
      this.reset();
      return;
    }
    this.state = state;
    this.ownsRecording = true;
    this.start();
    this.safety = this.setTimer(() => this.finish(), this.maxRecordingMs);
  }
  input(event) {
    if (event === "RESET" || event === "UNAVAILABLE") {
      this.reset();
      return;
    }
    if (event === "TAP_RESET") {
      if (this.state === "tap") this.reset();
      return;
    }
    if (event === "CHORD") {
      // In hands-free mode, Ctrl shortcuts are ordinary typing. Only a clean
      // Right Ctrl tap should finish; a shortcut must not discard the recording.
      if (this.state === "locked") {
        this.pressed = false;
        return;
      }
      this.reset();
      return;
    }
    if (event === "DOWN") {
      if (this.pressed) return;
      this.pressed = true;
      if (this.state === "locked") return;
      if (this.state === "idle" && this.isRecording()) {
        this.state = "external-stop";
        return;
      }
      if (!this.canStart()) {
        this.reset();
        return;
      }
      const second = this.state === "tap";
      this.clearPending();
      this.state = second ? "second" : "pending";
      this.timer = this.setTimer(() => {
        this.timer = null;
        if (this.pressed) this.begin("hold");
      }, this.holdMs);
      return;
    }
    if (event !== "UP" || !this.pressed) return;
    this.pressed = false;
    this.clearPending();
    if (["hold", "locked", "external-stop"].includes(this.state)) {
      this.finish();
    } else if (this.state === "second") {
      this.begin("locked");
    } else if (this.state === "pending") {
      this.state = "tap";
      this.timer = this.setTimer(() => this.reset(), this.doubleTapMs);
    }
  }
  finish() {
    const shouldStop = this.ownsRecording || this.state === "external-stop";
    this.ownsRecording = false;
    this.reset();
    if (shouldStop) this.stop();
  }
  recordingEnded() {
    this.ownsRecording = false;
    this.reset();
  }
  reset() {
    this.clearPending();
    if (this.safety !== null) this.clearTimer(this.safety);
    this.safety = null;
    const shouldCancel = this.ownsRecording;
    this.ownsRecording = false;
    this.pressed = false;
    this.state = "idle";
    if (shouldCancel) this.cancel();
  }
}
module.exports = RightCtrlGesture;
