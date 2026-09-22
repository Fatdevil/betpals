// ── LiveKit Cloud Streaming Client (SFU Architecture) ──
// Uses official LiveKit SDK: Single upload stream from broadcaster, distributed via Cloud SFU
// Automatic TURN/STUN, adaptive bitrate, reliable mobile reconnects, and no phone overheating.

import { Room, RoomEvent, Track, VideoPresets } from 'livekit-client';

let currentFacingMode = 'environment'; // default to back camera on mobile
let activeBroadcasterRoom = null;
let activeViewerRoom = null;
let activeLocalStream = null;

// ── Camera Permission Pre-check ──────────────────────────────
export async function testCameraAccess() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return { ok: false, error: 'Kamera stöds inte i denna webbläsare eller kräver HTTPS.' };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: currentFacingMode } },
      audio: true
    });
    stream.getTracks().forEach(t => t.stop());
    return { ok: true };
  } catch (err) {
    try {
      const vStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: currentFacingMode } }
      });
      vStream.getTracks().forEach(t => t.stop());
      return { ok: true, videoOnly: true };
    } catch (fallbackErr) {
      return { ok: false, error: fallbackErr.message || 'Kameratillstånd nekades' };
    }
  }
}

// ── Broadcaster (Host) Session ────────────────────────────────
export async function startBroadcasterSession({
  livekitUrl,
  token,
  videoElement,
  onStatusChange,
  onViewerCountChange,
  onDataReceived
}) {
  stopAllStreams();

  if (!livekitUrl || !token) {
    throw new Error('LiveKit Cloud-uppgifter saknas. Vänligen konfigurera LIVEKIT_URL, LIVEKIT_API_KEY och LIVEKIT_API_SECRET.');
  }

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true
    },
    videoCaptureDefaults: {
      facingMode: currentFacingMode,
      resolution: VideoPresets.h720.resolution
    }
  });

  activeBroadcasterRoom = room;

  // Track viewer presence
  const updateViewerCount = () => {
    // Broadcaster + all remote participants
    const count = Math.max(1, (room.remoteParticipants ? room.remoteParticipants.size : 0) + 1);
    if (onViewerCountChange) onViewerCountChange(count);
  };

  room.on(RoomEvent.ParticipantConnected, updateViewerCount);
  room.on(RoomEvent.ParticipantDisconnected, updateViewerCount);

  room.on(RoomEvent.Disconnected, (reason) => {
    if (onStatusChange) onStatusChange('disconnected', reason);
  });

  room.on(RoomEvent.Reconnecting, () => {
    if (onStatusChange) onStatusChange('reconnecting');
  });

  room.on(RoomEvent.Reconnected, () => {
    if (onStatusChange) onStatusChange('reconnected');
    updateViewerCount();
  });

  if (onDataReceived) {
    room.on(RoomEvent.DataReceived, (payload, participant) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        onDataReceived(data, participant);
      } catch (e) {}
    });
  }

  // Connect to LiveKit SFU
  await room.connect(livekitUrl, token);

  // Publish camera and microphone
  await room.localParticipant.setCameraEnabled(true, {
    facingMode: currentFacingMode,
    resolution: VideoPresets.h720.resolution
  });
  await room.localParticipant.setMicrophoneEnabled(true);

  // Attach local camera preview to videoElement (muted to prevent echo)
  if (videoElement) {
    videoElement.muted = true;
    videoElement.playsInline = true;
    const cameraTrackPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (cameraTrackPub && cameraTrackPub.track) {
      cameraTrackPub.track.attach(videoElement);
      await videoElement.play().catch(() => {});
    }
  }

  updateViewerCount();
  return { ok: true, room };
}

// ── Viewer Session (Recv-Only, No Local Camera) ───────────────
export async function startViewerSession({
  livekitUrl,
  token,
  videoElement,
  onStatusChange,
  onViewerCountChange,
  onAutoplayBlocked,
  onDataReceived
}) {
  stopAllStreams();

  if (!livekitUrl || !token) {
    throw new Error('LiveKit Cloud-uppgifter saknas. Vänligen konfigurera LIVEKIT_URL, LIVEKIT_API_KEY och LIVEKIT_API_SECRET.');
  }

  const room = new Room({
    adaptiveStream: true,
    dynacast: true
  });

  activeViewerRoom = room;

  const updateViewerCount = () => {
    const count = Math.max(1, (room.remoteParticipants ? room.remoteParticipants.size : 0) + 1);
    if (onViewerCountChange) onViewerCountChange(count);
  };

  room.on(RoomEvent.ParticipantConnected, updateViewerCount);
  room.on(RoomEvent.ParticipantDisconnected, updateViewerCount);

  // Subscribe to remote broadcaster tracks
  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    if (track.kind === Track.Kind.Video && videoElement) {
      track.attach(videoElement);
      videoElement.playsInline = true;
      videoElement.play().catch(() => {});
      if (onStatusChange) onStatusChange('connected');
    } else if (track.kind === Track.Kind.Audio) {
      const audioEl = track.attach();
      audioEl.id = 'livekit-remote-audio';
      document.body.appendChild(audioEl);
      audioEl.play().catch(err => {
        console.warn('Autoplay with sound blocked by browser policy:', err);
        if (onAutoplayBlocked) onAutoplayBlocked();
      });
    }
  });

  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    track.detach();
  });

  room.on(RoomEvent.Disconnected, (reason) => {
    if (onStatusChange) onStatusChange('disconnected', reason);
  });

  room.on(RoomEvent.Reconnecting, () => {
    if (onStatusChange) onStatusChange('reconnecting');
  });

  room.on(RoomEvent.Reconnected, () => {
    if (onStatusChange) onStatusChange('reconnected');
    updateViewerCount();
  });

  if (onDataReceived) {
    room.on(RoomEvent.DataReceived, (payload, participant) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        onDataReceived(data, participant);
      } catch (e) {}
    });
  }

  await room.connect(livekitUrl, token);
  updateViewerCount();

  return { ok: true, room };
}

// ── Camera Switch (Preserves Audio!) ──────────────────────────
export async function switchCamera(videoElement) {
  if (activeBroadcasterRoom) {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';

    try {
      // Disable and re-enable camera with new facing mode
      // Audio is NOT stopped or affected!
      await activeBroadcasterRoom.localParticipant.setCameraEnabled(false);
      await activeBroadcasterRoom.localParticipant.setCameraEnabled(true, {
        facingMode: currentFacingMode,
        resolution: VideoPresets.h720.resolution
      });

      if (videoElement) {
        const cameraTrackPub = activeBroadcasterRoom.localParticipant.getTrackPublication(Track.Source.Camera);
        if (cameraTrackPub && cameraTrackPub.track) {
          cameraTrackPub.track.attach(videoElement);
          await videoElement.play().catch(() => {});
        }
      }

      return { ok: true, facingMode: currentFacingMode };
    } catch (err) {
      console.error('Kunde inte byta kamera:', err);
      return { ok: false, error: err.message };
    }
  } else if (activeLocalStream) {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    const res = await startLocalCamera(videoElement, currentFacingMode);
    return res.ok ? { ok: true, facingMode: currentFacingMode } : { ok: false, error: res.error };
  }

  return { ok: false, error: 'Ingen aktiv sändning' };
}

// ── Audio Mute / Unmute Controls ──────────────────────────────
export async function toggleAudio() {
  if (activeBroadcasterRoom) {
    const isMuted = !activeBroadcasterRoom.localParticipant.isMicrophoneEnabled;
    // If muted -> enable, if enabled -> mute
    await activeBroadcasterRoom.localParticipant.setMicrophoneEnabled(isMuted);
    return isMuted;
  }
  if (activeLocalStream) {
    const audioTrack = activeLocalStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return audioTrack.enabled;
    }
  }
  return false;
}

export function isAudioEnabled() {
  if (activeBroadcasterRoom) return activeBroadcasterRoom.localParticipant.isMicrophoneEnabled;
  if (activeLocalStream) {
    const audioTrack = activeLocalStream.getAudioTracks()[0];
    return audioTrack ? audioTrack.enabled : false;
  }
  return true;
}

export function toggleViewerAudio() {
  const audioEl = document.getElementById('livekit-remote-audio');
  if (!audioEl) return false;
  audioEl.muted = !audioEl.muted;
  if (!audioEl.muted) {
    audioEl.play().catch(() => {});
  }
  return !audioEl.muted;
}

export function isViewerAudioMuted() {
  const audioEl = document.getElementById('livekit-remote-audio');
  if (!audioEl) return false;
  return audioEl.muted;
}

// ── Room Realtime Data (Fast Chat & Floating Reactions) ───────
export async function publishRoomData(payload) {
  const room = activeBroadcasterRoom || activeViewerRoom;
  if (!room || !room.localParticipant) return false;
  try {
    const data = new TextEncoder().encode(JSON.stringify(payload));
    await room.localParticipant.publishData(data, { reliable: true });
    return true;
  } catch (e) {
    return false;
  }
}

// ── Local Media Fallbacks (if LiveKit Cloud is not yet set up) ─
export async function startLocalCamera(videoElement, facing = 'environment') {
  stopLocalCamera();
  currentFacingMode = facing;
  try {
    activeLocalStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: currentFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true
    });
    if (videoElement) {
      videoElement.srcObject = activeLocalStream;
      videoElement.muted = true;
      await videoElement.play().catch(() => {});
    }
    return { ok: true, stream: activeLocalStream };
  } catch (err) {
    try {
      activeLocalStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: currentFacingMode } }
      });
      if (videoElement) {
        videoElement.srcObject = activeLocalStream;
        videoElement.muted = true;
        await videoElement.play().catch(() => {});
      }
      return { ok: true, stream: activeLocalStream, videoOnly: true };
    } catch (fallbackErr) {
      return { ok: false, error: fallbackErr.message || 'Kunde inte komma åt kameran' };
    }
  }
}

export function stopLocalCamera() {
  if (activeLocalStream) {
    activeLocalStream.getTracks().forEach(t => t.stop());
    activeLocalStream = null;
  }
}

// ── Master Cleanup ───────────────────────────────────────────
export function stopAllStreams() {
  stopLocalCamera();

  if (activeBroadcasterRoom) {
    try {
      if (activeBroadcasterRoom.localParticipant) {
        const pubs = activeBroadcasterRoom.localParticipant.trackPublications;
        if (pubs) {
          pubs.forEach((pub) => {
            if (pub && pub.track) {
              try { pub.track.stop(); } catch (e) {}
              try { pub.track.detach(); } catch (e) {}
            }
          });
        }
      }
      activeBroadcasterRoom.disconnect();
    } catch (e) {}
    activeBroadcasterRoom = null;
  }

  if (activeViewerRoom) {
    try { activeViewerRoom.disconnect(); } catch (e) {}
    activeViewerRoom = null;
  }

  // Cleanup video element srcObject and tracks if present
  try {
    const videoEl = document.getElementById('livestream-video');
    if (videoEl) {
      if (videoEl.srcObject && typeof videoEl.srcObject.getTracks === 'function') {
        videoEl.srcObject.getTracks().forEach(t => {
          try { t.stop(); } catch (e) {}
        });
      }
      videoEl.srcObject = null;
      try { videoEl.pause(); } catch (e) {}
    }
  } catch (e) {}

  const audioEl = document.getElementById('livekit-remote-audio');
  if (audioEl) audioEl.remove();
}

