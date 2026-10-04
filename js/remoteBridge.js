/**
 * PeerJS Remote Webcam Bridge
 * Enables streaming an external webcam (e.g. laptop/USB camera) directly to a mobile device.
 */
class RemoteBridgeManager {
    constructor() {
        this.peer = null;
        this.currentConn = null;
        this.myPeerId = null;
    }

    initPeer(onReady) {
        if (this.peer) return;

        // Generate a clean random 4-digit peer ID
        const randomId = 'guard-cam-' + Math.floor(1000 + Math.random() * 9000);
        
        try {
            this.peer = new Peer(randomId);

            this.peer.on('open', (id) => {
                this.myPeerId = id;
                const idDisplay = document.getElementById('my-peer-id');
                if (idDisplay) idDisplay.innerText = id;
                if (onReady) onReady(id);
            });

            this.peer.on('call', (call) => {
                // Answer incoming call with local webcam stream
                if (window.faceEngine && window.faceEngine.localStream) {
                    call.answer(window.faceEngine.localStream);
                }
            });

            this.peer.on('error', (err) => {
                console.warn('PeerJS Error:', err);
                const idDisplay = document.getElementById('my-peer-id');
                if (idDisplay) idDisplay.innerText = "Connection error. Retry.";
            });

        } catch (e) {
            console.error("PeerJS initialization failed:", e);
        }
    }

    connectToPeer(targetId, onStream) {
        if (!this.peer) {
            this.initPeer(() => this.connectToPeer(targetId, onStream));
            return;
        }

        const statusText = document.getElementById('remote-conn-status');
        if (statusText) statusText.innerText = "Connecting to " + targetId + "...";

        // Request media stream from remote broadcast peer
        const dummyCanvas = document.createElement('canvas');
        const emptyStream = dummyCanvas.captureStream();
        
        const call = this.peer.call(targetId, emptyStream);

        call.on('stream', (remoteStream) => {
            if (statusText) statusText.innerText = "Connected! Receiving video stream.";
            if (onStream) onStream(remoteStream);
        });

        call.on('error', (err) => {
            if (statusText) statusText.innerText = "Failed to connect to ID.";
        });
    }
}

window.remoteBridge = new RemoteBridgeManager();
