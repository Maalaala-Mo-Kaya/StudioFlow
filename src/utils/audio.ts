/**
 * Plays a two-tone studio notification chime using the browser Web Audio API.
 * Works 100% offline with zero external audio assets required.
 */
export function playStudioChime(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch {
    // Ignore audio context autoplay restrictions if user hasn't interacted yet
  }
}
