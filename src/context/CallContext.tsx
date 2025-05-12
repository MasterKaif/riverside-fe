/* eslint-disable @typescript-eslint/no-unused-vars */
import React, {
	createContext,
	useContext,
	useState,
	useEffect,
	ReactNode,
} from "react";
import { CallState, ConnectionState, MediaState } from "../types";
import { useAuth } from "./AuthContext";
import axiosInstance from "../axios.config";

interface CallContextType {
	callState: CallState;
	mediaState: MediaState;
	createSession: (
		sessionName: string,
		sessionDescription: string
	) => Promise<string>;
	joinSession: (sessionId: string) => Promise<void>;
	leaveSession: () => void;
	toggleAudio: () => void;
	toggleVideo: () => void;
	toggleScreenShare: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

// Initial call state
const initialCallState: CallState = {
	sessionId: null,
	connectionState: ConnectionState.DISCONNECTED,
	error: null,
	participants: [],
};

// Initial media state
const initialMediaState: MediaState = {
	localStream: null,
	remoteStream: null,
	audioEnabled: true,
	videoEnabled: true,
	isSharingScreen: false,
};

export const CallProvider: React.FC<{ children: ReactNode }> = ({
	children,
}) => {
	const { user } = useAuth();
	const [callState, setCallState] = useState<CallState>(initialCallState);
	const [mediaState, setMediaState] = useState<MediaState>(initialMediaState);
	const [peerConnection, setPeerConnection] =
		useState<RTCPeerConnection | null>(null);

	// Clean up when component unmounts
	useEffect(() => {
		return () => {
			if (mediaState.localStream) {
				mediaState.localStream.getTracks().forEach((track) => track.stop());
			}
			if (peerConnection) {
				peerConnection.close();
			}
		};
	}, [mediaState.localStream, peerConnection]);

	// Initialize media devices
	const initializeMediaDevices = async (): Promise<MediaStream> => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: true,
			});

      console.log("Media stream initialized:", stream);

			setMediaState((prev) => ({
				...prev,
				localStream: stream,
				audioEnabled: true,
				videoEnabled: true,
			}));

			return stream;
		} catch (error) {
			console.error("Error accessing media devices:", error);
			setCallState((prev) => ({
				...prev,
				error:
					"Failed to access camera and microphone. Please check permissions.",
				connectionState: ConnectionState.ERROR,
			}));
			throw error;
		}
	};

	// Initialize WebRTC peer connection
	const initializePeerConnection = (stream: MediaStream): RTCPeerConnection => {
		const pc = new RTCPeerConnection({
			iceServers: [
				{ urls: "stun:stun.l.google.com:19302" },
				{ urls: "stun:stun1.l.google.com:19302" },
			],
		});

		// Add local tracks to peer connection
		stream.getTracks().forEach((track) => {
			pc.addTrack(track, stream);
		});

		// Handle incoming remote streams
		pc.ontrack = (event) => {
			setMediaState((prev) => ({
				...prev,
				remoteStream: event.streams[0],
			}));
		};

		// Handle ICE connection state changes
		pc.oniceconnectionstatechange = () => {
			console.log("ICE connection state:", pc.iceConnectionState);

			if (
				pc.iceConnectionState === "connected" ||
				pc.iceConnectionState === "completed"
			) {
				setCallState((prev) => ({
					...prev,
					connectionState: ConnectionState.CONNECTED,
				}));
			} else if (
				pc.iceConnectionState === "failed" ||
				pc.iceConnectionState === "disconnected"
			) {
				setCallState((prev) => ({
					...prev,
					connectionState: ConnectionState.ERROR,
					error: "Connection failed. Please try again.",
				}));
			}
		};

		setPeerConnection(pc);
		return pc;
	};

	// Create a new session
	const createSession = async (
		sessionName: string,
		sessionDescription: string
	): Promise<string> => {
		try {
			setCallState({
				...initialCallState,
				connectionState: ConnectionState.CONNECTING,
			});

			// Initialize media devices
			const stream = await initializeMediaDevices();

			// Generate a new session ID
			const token = localStorage.getItem("authToken");
			if (!token) {
				throw new Error("User is not authenticated");
			}
			const session = await axiosInstance.post(
				"api/v1/studio/create",
				{
					name: sessionName,
					description: sessionDescription,
				},
				{
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
				}
			);

      console.log("Session created:", session.data);

			const sessionData = session.data?.session;
			if (!sessionData) {
				throw new Error("Failed to create session");
			}

			// Initialize peer connection
			initializePeerConnection(stream);

			// In a real app, you would register this session with your signaling server

			// Update call state
			setCallState({
				sessionId: sessionData.id,
				session: {
					id: sessionData.id,
					name: sessionData.name,
					description: sessionData.description,
				},
				connectionState: ConnectionState.CONNECTED,
				error: null,
				participants: user ? [user] : [],
			});

			return sessionData.id;
		} catch (error) {
			console.error("Error creating session:", error);
			setCallState({
				...initialCallState,
				error: "Failed to create session. Please try again.",
				connectionState: ConnectionState.ERROR,
			});
			throw error;
		}
	};

	// Join an existing session
	const joinSession = async (sessionId: string): Promise<void> => {
		try {
			setCallState({
				...initialCallState,
				sessionId,
				connectionState: ConnectionState.CONNECTING,
			});

			// Initialize media devices
			const stream = await initializeMediaDevices();

			// Initialize peer connection
			const pc = initializePeerConnection(stream);

			const token = localStorage.getItem("authToken");
			if (!token) {
				throw new Error("User is not authenticated");
			}

			const session = await axiosInstance.post(
				"api/v1/studio/join",
				{
					session_id: sessionId,
				},
				{
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
				}
			);

			const sessionData = session.data?.session;
			if (!sessionData) {
				throw new Error("Failed to join session");
			}

			// In a real app, you would connect to the signaling server and exchange SDP with the other peer

			// For demo purposes, we'll just simulate a successful connection
			setCallState({
				sessionId: sessionData.Id,
        session: {
          id: sessionData.Id,
          name: sessionData.Name,
          description: sessionData.Description,
        },
				connectionState: ConnectionState.CONNECTED,
				error: null,
				participants: [user, sessionData.host],
			});
		} catch (error) {
			console.error("Error joining session:", error);
			setCallState({
				...initialCallState,
				error: "Failed to join session. Please try again.",
				connectionState: ConnectionState.ERROR,
			});
		}
	};

	// Leave the current session
	const leaveSession = (): void => {
		// Stop local media tracks
		if (mediaState.localStream) {
			mediaState.localStream.getTracks().forEach((track) => track.stop());
		}

		// Close peer connection
		if (peerConnection) {
			peerConnection.close();
			setPeerConnection(null);
		}

		// Reset states
		setCallState(initialCallState);
		setMediaState(initialMediaState);
	};

	// Toggle audio
	const toggleAudio = (): void => {
		if (mediaState.localStream) {
			const audioTrack = mediaState.localStream.getAudioTracks()[0];
			if (audioTrack) {
				audioTrack.enabled = !audioTrack.enabled;
				setMediaState((prev) => ({
					...prev,
					audioEnabled: audioTrack.enabled,
				}));
			}
		}
	};

	// Toggle video
	const toggleVideo = (): void => {
		if (mediaState.localStream) {
			const videoTrack = mediaState.localStream.getVideoTracks()[0];
			if (videoTrack) {
				videoTrack.enabled = !videoTrack.enabled;
				setMediaState((prev) => ({
					...prev,
					videoEnabled: videoTrack.enabled,
				}));
			}
		}
	};

	// Toggle screen sharing
	const toggleScreenShare = async (): Promise<void> => {
		try {
			if (!mediaState.isSharingScreen) {
				// Start screen sharing
				const screenStream = await navigator.mediaDevices.getDisplayMedia({
					video: true,
				});

				// Replace video track in local stream and peer connection
				if (mediaState.localStream && peerConnection) {
					const videoTrack = mediaState.localStream.getVideoTracks()[0];
					const screenTrack = screenStream.getVideoTracks()[0];

					if (videoTrack && screenTrack) {
						// Replace track in local stream
						mediaState.localStream.removeTrack(videoTrack);
						mediaState.localStream.addTrack(screenTrack);

						// Replace track in peer connection
						const senders = peerConnection.getSenders();
						const sender = senders.find(
							(s) => s.track && s.track.kind === "video"
						);
						if (sender) {
							sender.replaceTrack(screenTrack);
						}

						// Listen for screen sharing end event
						screenTrack.onended = () => {
							toggleScreenShare();
						};

						setMediaState((prev) => ({
							...prev,
							isSharingScreen: true,
						}));
					}
				}
			} else {
				// Stop screen sharing and revert to camera
				const cameraStream = await navigator.mediaDevices.getUserMedia({
					video: true,
				});

				// Replace video track in local stream and peer connection
				if (mediaState.localStream && peerConnection) {
					const screenTrack = mediaState.localStream.getVideoTracks()[0];
					const cameraTrack = cameraStream.getVideoTracks()[0];

					if (screenTrack && cameraTrack) {
						// Replace track in local stream
						mediaState.localStream.removeTrack(screenTrack);
						mediaState.localStream.addTrack(cameraTrack);

						// Replace track in peer connection
						const senders = peerConnection.getSenders();
						const sender = senders.find(
							(s) => s.track && s.track.kind === "video"
						);
						if (sender) {
							sender.replaceTrack(cameraTrack);
						}

						// Stop screen track
						screenTrack.stop();

						setMediaState((prev) => ({
							...prev,
							isSharingScreen: false,
						}));
					}
				}
			}
		} catch (error) {
			console.error("Error toggling screen share:", error);
		}
	};

	return (
		<CallContext.Provider
			value={{
				callState,
				mediaState,
				createSession,
				joinSession,
				leaveSession,
				toggleAudio,
				toggleVideo,
				toggleScreenShare,
			}}
		>
			{children}
		</CallContext.Provider>
	);
};

// Custom hook to use call context
export const useCall = (): CallContextType => {
	const context = useContext(CallContext);

	if (context === undefined) {
		throw new Error("useCall must be used within a CallProvider");
	}

	return context;
};
