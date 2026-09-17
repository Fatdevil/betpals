// ── Live Streaming Manager (Local Camera Mock & LiveKit Ready) ──
let localMediaStream = null;
let currentFacingMode = 'environment'; // default to back camera on mobile
let isMuted = false;

export async function startLocalCamera(videoElement, facing = 'environment') {
  stopLocalCamera();
  currentFacingMode = facing;
  try {
    const constraints = {
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: true
    };
    localMediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (videoElement) {
      videoElement.srcObject = localMediaStream;
      videoElement.muted = true; // Mute local preview to prevent echo
      await videoElement.play().catch(() => {});
    }
    return { ok: true, stream: localMediaStream };
  } catch (err) {
    console.warn('Could not access requested camera with audio, retrying video only:', err);
    try {
      localMediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: currentFacingMode } }
      });
      if (videoElement) {
        videoElement.srcObject = localMediaStream;
        videoElement.muted = true;
        await videoElement.play().catch(() => {});
      }
      return { ok: true, stream: localMediaStream };
    } catch (fallbackErr) {
      console.error('Camera access failed completely:', fallbackErr);
      return { ok: false, error: fallbackErr.message || 'Kunde inte komma åt kameran' };
    }
  }
}

export function stopLocalCamera() {
  if (localMediaStream) {
    localMediaStream.getTracks().forEach(track => track.stop());
    localMediaStream = null;
  }
}

export async function switchCamera(videoElement) {
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  return startLocalCamera(videoElement, currentFacingMode);
}

export function toggleAudio() {
  if (!localMediaStream) return false;
  isMuted = !isMuted;
  localMediaStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });
  return !isMuted;
}

export function isAudioEnabled() {
  return !isMuted;
}

export function getLocalStream() {
  return localMediaStream;
}
