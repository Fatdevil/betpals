// ── Live Streaming Manager (WebRTC Broadcast & Receiver System) ──
// Host broadcasts audio/video tracks to viewers over WebRTC with WebSocket signaling.
// Viewers only subscribe (recvonly) and NEVER request local camera or microphone.

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

let localMediaStream = null;
let currentFacingMode = 'environment'; // default to back camera on mobile
let isMuted = false;

// Broadcaster state: Map of viewerId -> RTCPeerConnection
const broadcasterPeers = new Map();
let broadcasterSendSignal = null;
let broadcasterLiveId = null;

// Viewer state: single RTCPeerConnection to broadcaster
let viewerPeerConnection = null;
let viewerSendSignal = null;
let viewerLiveId = null;
let viewerVideoElement = null;

// ── Broadcaster Local Camera Controls ────────────────────────

export async function testCameraAccess() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: currentFacingMode } },
      audio: true
    });
    // Immediately stop tracks after testing
    stream.getTracks().forEach(t => t.stop());
    return { ok: true };
  } catch (err) {
    // Try video-only fallback test
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
      return { ok: true, stream: localMediaStream, videoOnly: true };
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
  const res = await startLocalCamera(videoElement, currentFacingMode);
  // Update tracks in active broadcaster peer connections
  if (res.ok && localMediaStream) {
    const videoTrack = localMediaStream.getVideoTracks()[0];
    if (videoTrack) {
      broadcasterPeers.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack).catch(e => console.warn('replaceTrack error:', e));
        }
      });
    }
  }
  return res;
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

// ── Broadcaster WebRTC Signaling & Connection Handling ───────

export function initBroadcasterWebRTC(liveId, sendSignalFn) {
  broadcasterLiveId = liveId;
  broadcasterSendSignal = sendSignalFn;
}

export async function handleBroadcasterWebRTCMessage(msg) {
  if (!broadcasterSendSignal || !localMediaStream) return;

  // When a viewer sends webrtc_viewer_join, create offer for this viewer
  if (msg.type === 'webrtc_viewer_join' && msg.viewerId) {
    const viewerId = msg.viewerId;

    // Close any previous connection for this viewer
    if (broadcasterPeers.has(viewerId)) {
      try { broadcasterPeers.get(viewerId).close(); } catch (e) {}
      broadcasterPeers.delete(viewerId);
    }

    try {
      const pc = new RTCPeerConnection(rtcConfig);
      broadcasterPeers.set(viewerId, pc);

      // Add all local tracks (video and audio)
      localMediaStream.getTracks().forEach(track => {
        pc.addTrack(track, localMediaStream);
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          broadcasterSendSignal({
            type: 'webrtc_signal',
            liveId: broadcasterLiveId,
            targetUserId: viewerId,
            signal: {
              type: 'candidate',
              candidate: event.candidate
            }
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          broadcasterPeers.delete(viewerId);
        }
      };

      // Create and send SDP offer to viewer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      broadcasterSendSignal({
        type: 'webrtc_signal',
        liveId: broadcasterLiveId,
        targetUserId: viewerId,
        signal: {
          type: 'offer',
          sdp: offer
        }
      });
    } catch (err) {
      console.error('Broadcaster failed to create WebRTC connection for viewer:', viewerId, err);
    }
  }

  // When viewer sends back answer or candidate
  if (msg.type === 'webrtc_signal' && msg.fromUserId && msg.signal) {
    const pc = broadcasterPeers.get(msg.fromUserId);
    if (!pc) return;

    try {
      if (msg.signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.signal.sdp));
      } else if (msg.signal.type === 'candidate' && msg.signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.signal.candidate));
      }
    } catch (err) {
      console.warn('Broadcaster error handling signal from', msg.fromUserId, err);
    }
  }
}

// ── Viewer WebRTC Receiver (Recv-Only, No Local Camera) ──────

export function startViewerStream(videoElement, liveId, sendSignalFn) {
  closeViewerStream();

  viewerLiveId = liveId;
  viewerSendSignal = sendSignalFn;
  viewerVideoElement = videoElement;

  if (viewerVideoElement) {
    viewerVideoElement.muted = false; // Unmuted for viewer
    viewerVideoElement.playsInline = true;
  }

  // Tell broadcaster that this viewer has joined and is ready for stream
  if (viewerSendSignal) {
    viewerSendSignal({
      type: 'webrtc_viewer_join',
      liveId: viewerLiveId
    });
  }
}

export async function handleViewerWebRTCMessage(msg) {
  if (!viewerSendSignal || !viewerLiveId) return;

  if (msg.type === 'webrtc_signal' && msg.signal) {
    const fromBroadcasterId = msg.fromUserId;

    // Handle incoming offer from broadcaster
    if (msg.signal.type === 'offer' && msg.signal.sdp) {
      try {
        if (viewerPeerConnection) {
          try { viewerPeerConnection.close(); } catch (e) {}
        }

        viewerPeerConnection = new RTCPeerConnection(rtcConfig);

        // Receive remote stream
        viewerPeerConnection.ontrack = (event) => {
          if (viewerVideoElement && event.streams && event.streams[0]) {
            viewerVideoElement.srcObject = event.streams[0];
            viewerVideoElement.play().catch(e => {
              console.warn('Autoplay with sound blocked, trying muted playback:', e);
              if (viewerVideoElement) {
                viewerVideoElement.muted = true;
                viewerVideoElement.play().catch(() => {});
              }
            });
          }
        };

        // ICE candidate exchange
        viewerPeerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            viewerSendSignal({
              type: 'webrtc_signal',
              liveId: viewerLiveId,
              targetUserId: fromBroadcasterId,
              signal: {
                type: 'candidate',
                candidate: event.candidate
              }
            });
          }
        };

        await viewerPeerConnection.setRemoteDescription(new RTCSessionDescription(msg.signal.sdp));
        const answer = await viewerPeerConnection.createAnswer();
        await viewerPeerConnection.setLocalDescription(answer);

        // Send answer back to broadcaster
        viewerSendSignal({
          type: 'webrtc_signal',
          liveId: viewerLiveId,
          targetUserId: fromBroadcasterId,
          signal: {
            type: 'answer',
            sdp: answer
          }
        });
      } catch (err) {
        console.error('Viewer failed to handle WebRTC offer:', err);
      }
    } else if (msg.signal.type === 'candidate' && msg.signal.candidate && viewerPeerConnection) {
      try {
        await viewerPeerConnection.addIceCandidate(new RTCIceCandidate(msg.signal.candidate));
      } catch (err) {
        console.warn('Viewer failed to add ICE candidate:', err);
      }
    }
  }
}

export function closeViewerStream() {
  if (viewerPeerConnection) {
    try { viewerPeerConnection.close(); } catch (e) {}
    viewerPeerConnection = null;
  }
  if (viewerVideoElement) {
    viewerVideoElement.srcObject = null;
    viewerVideoElement = null;
  }
  viewerLiveId = null;
  viewerSendSignal = null;
}

// ── Master Cleanup ───────────────────────────────────────────

export function stopAllStreams() {
  stopLocalCamera();

  broadcasterPeers.forEach(pc => {
    try { pc.close(); } catch (e) {}
  });
  broadcasterPeers.clear();
  broadcasterSendSignal = null;
  broadcasterLiveId = null;

  closeViewerStream();
}
