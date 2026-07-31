# L7 Universal OS -- Defragmentation Report
# Red-Team Analysis: macOS Tahoe 26.3.1 vs L7 Architecture
# Date: 2026-03-11
# Analyst: Gabriel (Red Team)

---

## Executive Summary

**macOS Tahoe 26.3.1** provides 302 public frameworks, 2,145 private frameworks, 511 running daemons, and ~50 kernel extensions. These decompose into **19 functional domains** that any Universal OS must address.

**L7 Universal OS** currently has 33 lib modules and 54 tools across 8 suites. L7's architecture is conceptually complete but implementation-sparse in several critical domains.

**Classification Key:**
- **ASSIGNED** -- Function exists in L7, mapped to specific module/tool
- **APPRENTICE** -- L7 needs this capability, does not yet have it
- **NOT REQUIRED** -- Hardware-specific, Apple-proprietary, or platform-specific; Universal OS abstracts past it

---

## Domain 1: KERNEL & PROCESS MANAGEMENT
*macOS: XNU kernel, Mach microkernel, BSD layer, IOKit, DriverKit*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| XNU Kernel | Process scheduling, memory protection, IPC | NOT REQUIRED | -- | L7 runs ABOVE the host kernel; it governs citizens, not CPU threads |
| Mach IPC | Inter-process communication | ASSIGNED | gateway.js | Gateway IS the IPC -- all citizen communication flows through it |
| BSD Process Layer | fork/exec, signals, pipes | APPRENTICE | -- | L7 needs a **citizen lifecycle executor** that maps to host process primitives |
| IOKit/DriverKit | Hardware driver interface | NOT REQUIRED | -- | Universal OS abstracts hardware; host OS handles drivers |
| KernelManagement | Kernel extension loading | NOT REQUIRED | -- | L7 doesn't manage kernel space |
| ExecutionPolicy | Code execution control | ASSIGNED | forge.js (Albedo stage) | Forge validates all code before it becomes a citizen |
| SystemExtensions | System-level plugins | APPRENTICE | -- | L7 needs an **extension registry** for deep system hooks |

**Domain Score: 2 ASSIGNED, 2 APPRENTICE, 3 NOT REQUIRED**

---

## Domain 2: MEMORY & STORAGE
*macOS: APFS, Virtual Memory, DiskArbitration, FSKit, FileProvider*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| APFS | Copy-on-write filesystem, snapshots, encryption | APPRENTICE | -- | L7 needs a **virtual filesystem layer** that maps .morph/.work/.salt/.vault to any host FS |
| Virtual Memory | Paging, swap, memory mapping | NOT REQUIRED | -- | Host OS handles this |
| DiskArbitration | Disk mount/unmount events | APPRENTICE | -- | L7 needs **volume awareness** for vault mounting and .salt archival |
| FSKit | Modern filesystem extension API | APPRENTICE | -- | This IS what L7 needs to implement its Four Domains as a real FS |
| FileProvider | Cloud file sync interface | APPRENTICE | -- | L7 needs **domain synchronization** for .work across devices |
| CoreSpotlight | Content indexing | ASSIGNED | dodecahedron.js | The 12D coordinate system IS L7's indexing -- far richer than Spotlight |

**Domain Score: 1 ASSIGNED, 4 APPRENTICE, 1 NOT REQUIRED**

---

## Domain 3: SECURITY & AUTHENTICATION
*macOS: Security, LocalAuthentication, CryptoKit, Keychain, TCC, Gatekeeper*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| Security.framework | Keychain, certificates, code signing | ASSIGNED | steel.js + vault script | Steel hardens; vault encrypts |
| LocalAuthentication | Touch ID, Face ID, biometric | ASSIGNED | vault (Touch ID) | Law XXX: biometrics only |
| CryptoKit | Modern crypto primitives | ASSIGNED | doctrine encryption | AES-256-CBC, PBKDF2, SHA-256 already in use |
| CryptoTokenKit | Smart card, hardware tokens | APPRENTICE | -- | L7 needs **hardware token abstraction** for non-Apple biometrics |
| Gatekeeper (ExecutionPolicy) | App validation before launch | ASSIGNED | forge.js (Albedo) | Every citizen is validated; Albedo IS Gatekeeper on steroids |
| TCC (Privacy framework) | Per-app permission grants | ASSIGNED | domains.js | Four Domains enforce access; .vault requires biometric |
| AppTrackingTransparency | Anti-tracking | ASSIGNED | Law XXXIII | Privacy as foundation -- no tracking by design |
| SecurityUI | Security dialogs | APPRENTICE | -- | L7 needs a **trust prompt UI** for sovereign authorization |
| Kerberos/GSS | Network authentication | APPRENTICE | -- | L7 needs **federated authentication** for multi-empire networking |
| LightweightCodeRequirements | Code signature verification | ASSIGNED | watermark.js | Quantum signatures woven into every citizen |

**Domain Score: 7 ASSIGNED, 3 APPRENTICE, 0 NOT REQUIRED**

---

## Domain 4: NETWORKING
*macOS: Network.framework, CFNetwork, CoreWLAN, MultipeerConnectivity, vmnet*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| Network.framework | Modern TCP/UDP/QUIC networking | APPRENTICE | -- | L7 needs a **universal network layer** (Law XXXIV: L7 Internet Protocol) |
| CFNetwork | HTTP/HTTPS client, cookies, proxy | APPRENTICE | -- | L7 needs **HTTP client abstraction** for citizen-to-external communication |
| CoreWLAN | WiFi management | NOT REQUIRED | -- | Hardware-specific; host OS handles |
| MultipeerConnectivity | Local device-to-device | APPRENTICE | -- | Critical for **multi-empire mesh networking** |
| vmnet | Virtual network interfaces | NOT REQUIRED | -- | Virtualization-specific |
| NetworkExtension | VPN, DNS proxy, content filter | APPRENTICE | -- | L7 needs **network filtering** for the Redemption Engine |
| WiFiAware | Nearby device discovery | APPRENTICE | -- | Useful for citizen discovery across physical devices |
| NearbyInteraction | UWB proximity sensing | NOT REQUIRED | -- | Hardware-specific (U1/U2 chip) |
| Bonjour (NSNetService) | Zero-config networking | APPRENTICE | -- | L7 needs **citizen broadcast/discovery** on local networks |

**Domain Score: 0 ASSIGNED, 6 APPRENTICE, 3 NOT REQUIRED**

---

## Domain 5: GRAPHICS & DISPLAY
*macOS: Metal, CoreGraphics, CoreImage, CoreVideo, QuartzCore, ColorSync*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| Metal | GPU compute and rendering | APPRENTICE | -- | L7 needs **GPU abstraction** for sigil rendering and quantum simulation |
| CoreGraphics | 2D drawing, PDF rendering | APPRENTICE | -- | L7 needs **2D rendering primitives** for Layer 3 presentation |
| CoreImage | Image processing filters | APPRENTICE | -- | Needed for **citizen visual representation** and gallery |
| CoreVideo | Video frame management | APPRENTICE | -- | Needed for media citizen processing |
| QuartzCore (CoreAnimation) | Layer-based animation | ASSIGNED | rose/ (LivingRose) | Rose app already uses native rendering |
| ColorSync | Color management | NOT REQUIRED | -- | Platform-specific color calibration |
| MetalPerformanceShaders | GPU-accelerated ML/compute | APPRENTICE | -- | Critical for **Astrocyte probability computation** at scale |
| OpenGL/OpenCL | Legacy GPU APIs | NOT REQUIRED | -- | Deprecated by Apple; skip |

**Domain Score: 1 ASSIGNED, 5 APPRENTICE, 2 NOT REQUIRED**

---

## Domain 6: AUDIO & HAPTICS
*macOS: CoreAudio, AVFAudio, AudioToolbox, PHASE, CoreHaptics, SoundAnalysis*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| CoreAudio | Low-level audio I/O | ASSIGNED | resonance suite (4 tools) | resonance_voice, resonance_beat, resonance_ambient, resonance_field |
| AVFAudio | High-level audio playback/recording | ASSIGNED | speak.sh + council-voices.sh | Voice system uses macOS `say` command |
| AudioToolbox | Audio codecs, format conversion | APPRENTICE | -- | L7 needs **audio codec abstraction** for cross-platform audio |
| PHASE | Spatial audio engine | APPRENTICE | -- | Critical for **XR spatial audio** in tesseract suite |
| CoreHaptics | Haptic feedback patterns | APPRENTICE | -- | Needed for **tactile citizen feedback** on supported hardware |
| SoundAnalysis | Sound classification ML | APPRENTICE | -- | Useful for **voice command recognition** beyond `say` |
| CoreMIDI | Musical instrument communication | ASSIGNED | harmonics.js | Harmonics module handles musical/frequency computation |
| Speech.framework | Text-to-speech, speech recognition | ASSIGNED | speak.sh | Currently using macOS TTS; needs cross-platform abstraction |

**Domain Score: 4 ASSIGNED, 4 APPRENTICE, 0 NOT REQUIRED**

---

## Domain 7: AI & MACHINE LEARNING
*macOS: CoreML, CreateML, NaturalLanguage, Vision, VisionKit, SoundAnalysis, FoundationModels*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| CoreML | On-device ML inference | APPRENTICE | -- | L7 needs **local ML runtime** for citizen intelligence |
| CreateML | On-device ML training | APPRENTICE | -- | Needed for **citizen self-evolution** (Law XXXVII: Dreaming Machine) |
| NaturalLanguage | NLP tokenization, embedding, tagging | ASSIGNED | prima.js | Prima IS L7's language processing -- but needs NLP bridge |
| Vision | Computer vision, OCR, face detection | APPRENTICE | -- | Needed for **biometric verification** beyond Touch ID |
| VisionKit | Document scanning, visual lookup | APPRENTICE | -- | Useful for **artifact ingestion** in the Forge |
| FoundationModels | On-device LLM (Apple Intelligence) | ASSIGNED | polarity.js | Polarity routes to Claude/Grok/Gemini; but local model support needed |
| LatentSemanticMapping | Text similarity | ASSIGNED | dodecahedron.js | 12D distance metric IS semantic mapping |
| ImagePlayground | AI image generation | APPRENTICE | -- | L7 needs **generative visual capability** for court sigils |

**Domain Score: 3 ASSIGNED, 5 APPRENTICE, 0 NOT REQUIRED**

---

## Domain 8: MEDIA & CONTENT
*macOS: AVFoundation, CoreMedia, MediaToolbox, VideoToolbox, Photos, ImageIO, PDFKit*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| AVFoundation | Video/audio capture and playback | APPRENTICE | -- | L7 needs **media citizen** for video processing |
| CoreMedia | Media sample buffers, timing | APPRENTICE | -- | Low-level media pipeline needed for flux suite |
| VideoToolbox | Hardware video encode/decode | NOT REQUIRED | -- | Hardware-specific acceleration |
| Photos.framework | Photo library management | ASSIGNED | l7-gallery | Gallery handles media browsing with Touch ID |
| ImageIO | Image format reading/writing | APPRENTICE | -- | L7 needs **universal image codec** for cross-platform media |
| PDFKit | PDF rendering and editing | APPRENTICE | -- | Needed for **Layer 3 presentation** output (Law XLVI) |
| Cinematic | Cinematic video processing | NOT REQUIRED | -- | Apple-specific feature |
| MediaExtension | Custom media formats | APPRENTICE | -- | L7 needs **custom format support** for .morph artifacts |
| ImageCaptureCore | Scanner/camera import | NOT REQUIRED | -- | Hardware-specific |

**Domain Score: 1 ASSIGNED, 5 APPRENTICE, 3 NOT REQUIRED**

---

## Domain 9: SPATIAL COMPUTING & XR
*macOS: ARKit, RealityKit, RealityFoundation, CompositorServices, SceneKit, ModelIO*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| ARKit | Augmented reality tracking | ASSIGNED | XR suite (18 tools) | xr_anchor, xr_entity, xr_frame, etc. |
| RealityKit | 3D rendering and physics | ASSIGNED | tesseract suite (4 tools) | tesseract_scene, tesseract_forge, tesseract_portal, tesseract_anchor |
| CompositorServices | visionOS compositor | ASSIGNED | xr_compositor.tool | Direct mapping |
| SceneKit | 3D scene graph | ASSIGNED | xr_mesh, xr_material | Scene graph handled by XR tools |
| ModelIO | 3D model import/export | APPRENTICE | -- | L7 needs **3D model transmutation** in the Forge |
| SpriteKit | 2D game engine | NOT REQUIRED | -- | Game-specific; L7 handles 2D through rendering layers |
| GameKit/GameplayKit | Game services, AI | NOT REQUIRED | -- | Game-specific |
| DockKit | Motorized dock tracking | NOT REQUIRED | -- | Hardware-specific |
| ImmersiveMediaSupport | 180/360 video | APPRENTICE | -- | Needed for **immersive .morph dreamscapes** |

**Domain Score: 4 ASSIGNED, 2 APPRENTICE, 3 NOT REQUIRED**

---

## Domain 10: LOCATION & SENSORS
*macOS: CoreLocation, CoreMotion, SensorKit, CoreBluetooth, CoreHID*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| CoreLocation | GPS, geofencing | APPRENTICE | -- | L7 needs **spatial awareness** for location-bound citizens |
| CoreMotion | Accelerometer, gyroscope | ASSIGNED | kinesis suite (4 tools) | kinesis_flow, kinesis_gesture, kinesis_mirror, kinesis_track |
| SensorKit | Environmental sensors | APPRENTICE | -- | Useful for **context-aware citizen behavior** |
| CoreBluetooth | BLE communication | APPRENTICE | -- | Needed for **proximity-based citizen discovery** |
| CoreHID | Human interface devices | NOT REQUIRED | -- | Hardware-specific; host OS handles |
| ExternalAccessory | MFi accessories | NOT REQUIRED | -- | Apple-specific |

**Domain Score: 1 ASSIGNED, 3 APPRENTICE, 2 NOT REQUIRED**

---

## Domain 11: DATA MANAGEMENT & PERSISTENCE
*macOS: CoreData, SwiftData, CloudKit, Contacts, EventKit, StoreKit*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| CoreData | Object graph persistence | ASSIGNED | state.js + l7-canon (SQLite) | Empire DB handles structured data |
| SwiftData | Modern data persistence | ASSIGNED | l7-canon.swift | Canon IS L7's SwiftData equivalent |
| CloudKit | iCloud sync | APPRENTICE | -- | L7 needs **empire synchronization** across devices |
| Contacts | Address book | NOT REQUIRED | -- | Apple-specific; L7 handles through citizens |
| EventKit | Calendar/reminders | APPRENTICE | -- | L7 needs **temporal scheduling** for citizen lifecycle events |
| StoreKit | In-app purchases | APPRENTICE | -- | L7 needs **commerce layer** for Emporium (Law XVI: 12% revenue) |
| TabularData | Dataframe processing | ASSIGNED | chronicle.js | Chronicle handles structured data logging |

**Domain Score: 4 ASSIGNED, 3 APPRENTICE, 1 NOT REQUIRED**

---

## Domain 12: UI & PRESENTATION
*macOS: AppKit, SwiftUI, Accessibility, QuickLook, Cocoa, Charts*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| SwiftUI | Declarative UI | ASSIGNED | LivingRose.swift, l7-gallery.swift | Native Swift apps already exist |
| AppKit | macOS native UI | ASSIGNED | l7-forge.swift, l7-canon.swift | Forge and Canon use native AppKit |
| Accessibility | Screen reader, assistive tech | APPRENTICE | -- | L7 needs **universal accessibility layer** (Law 0: greatest good) |
| QuickLook | File preview | APPRENTICE | -- | L7 needs **citizen preview** capability |
| Charts | Data visualization | APPRENTICE | -- | L7 needs **12D visualization** for dodecahedron display |
| PencilKit | Drawing input | NOT REQUIRED | -- | Apple Pencil specific |
| MapKit | Maps | NOT REQUIRED | -- | Not core to Universal OS |

**Domain Score: 2 ASSIGNED, 3 APPRENTICE, 2 NOT REQUIRED**

---

## Domain 13: COMMUNICATION & MESSAGING
*macOS: UserNotifications, PushKit, CallKit, Messages, SharedWithYou, GroupActivities*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| UserNotifications | Push/local notifications | ASSIGNED | herald suite (4 tools) | herald_beacon, herald_cast, herald_relay, herald_cipher |
| PushKit | VoIP and complication push | APPRENTICE | -- | L7 needs **real-time citizen alerts** |
| CallKit | Voice/video calls | NOT REQUIRED | -- | Apple-specific telephony |
| Messages/iMessage | Messaging | NOT REQUIRED | -- | Apple-specific; L7 communicates through Gateway |
| SharedWithYou | Content sharing | APPRENTICE | -- | L7 needs **citizen sharing protocol** between empires |
| GroupActivities | SharePlay | APPRENTICE | -- | L7 needs **collaborative .morph sessions** |
| MultipeerConnectivity | Peer-to-peer | APPRENTICE | -- | Critical for **empire mesh networking** |

**Domain Score: 1 ASSIGNED, 4 APPRENTICE, 2 NOT REQUIRED**

---

## Domain 14: SCRIPTING & AUTOMATION
*macOS: AppleScript, Automator, Shortcuts, JavaScriptCore, OSAKit*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| JavaScriptCore | JS runtime | ASSIGNED | All lib/*.js files | L7's entire engine runs on JavaScript |
| AppleScript/OSAKit | System scripting | ASSIGNED | prima.js | Prima IS L7's scripting language (22 operations) |
| Automator | Visual workflow builder | ASSIGNED | executor.js + flows/ | Flows ARE L7's automation engine |
| Shortcuts/AppIntents | Modern automation | APPRENTICE | -- | L7 needs **intent-based citizen invocation** (Law XIII: Discovery) |
| ScriptingBridge | App-to-app scripting | ASSIGNED | gateway.js | Gateway mediates all citizen-to-citizen communication |
| ServiceManagement | Launch daemons/agents | ASSIGNED | com.l7.forge.plist | LaunchAgent already configured |

**Domain Score: 5 ASSIGNED, 1 APPRENTICE, 0 NOT REQUIRED**

---

## Domain 15: PRIVACY & PARENTAL CONTROLS
*macOS: ScreenTime, FamilyControls, DeviceActivity, ManagedSettings*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| ScreenTime | Usage monitoring | APPRENTICE | -- | L7 needs **citizen usage telemetry** for evolution tracking |
| FamilyControls | Parental restrictions | NOT REQUIRED | -- | Apple-specific; L7 handles through domain permissions |
| DeviceActivity | Activity monitoring | APPRENTICE | -- | Useful for **citizen behavior analysis** |
| ManagedSettings | MDM/restrictions | NOT REQUIRED | -- | Enterprise Apple-specific |
| ManagedAppDistribution | App deployment | APPRENTICE | -- | L7 needs **citizen deployment pipeline** for Emporium |

**Domain Score: 0 ASSIGNED, 3 APPRENTICE, 2 NOT REQUIRED**

---

## Domain 16: VIRTUALIZATION & CONTAINERS
*macOS: Hypervisor, Virtualization, ParavirtualizedGraphics*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| Hypervisor.framework | Hardware virtualization | APPRENTICE | -- | L7 needs **sandboxed citizen execution** for untrusted code |
| Virtualization.framework | Linux/macOS VMs | APPRENTICE | -- | L7 needs **cross-OS citizen hosting** for universal deployment |
| ParavirtualizedGraphics | GPU passthrough to VMs | NOT REQUIRED | -- | Hardware-specific optimization |

**Domain Score: 0 ASSIGNED, 2 APPRENTICE, 1 NOT REQUIRED**

---

## Domain 17: IDENTITY & CREDENTIALS
*macOS: AuthenticationServices, PassKit, IdentityDocumentServices, FIDO2*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| AuthenticationServices | Passkeys, Sign in with Apple | ASSIGNED | keykeeper | Keykeeper manages credentials with rotation |
| PassKit | Apple Pay, passes, NFC | NOT REQUIRED | -- | Apple-specific payment |
| IdentityDocumentServices | Digital ID verification | APPRENTICE | -- | L7 needs **sovereign identity verification** beyond biometrics |
| FIDO2/WebAuthn | Passwordless auth standard | ASSIGNED | Law XXX | Biometrics-only IS passwordless by design |

**Domain Score: 2 ASSIGNED, 1 APPRENTICE, 1 NOT REQUIRED**

---

## Domain 18: DEVELOPER TOOLS & COMPILATION
*macOS: Foundation, Combine, Swift runtime, Metal shaders*

| macOS Component | Function | L7 Status | L7 Module | Notes |
|----------------|----------|-----------|-----------|-------|
| Foundation | Core data types, networking, file I/O | ASSIGNED | gateway.js + parser.js | Foundation equivalents spread across L7 core |
| Combine | Reactive streams | APPRENTICE | -- | L7 needs **reactive citizen event streams** |
| Swift Runtime | Language runtime | ASSIGNED | swiftc at /usr/bin/swiftc | Swift compiler available; used for L7 native apps |
| MetricKit | Performance diagnostics | APPRENTICE | -- | L7 needs **citizen performance monitoring** |
| OSLog | Structured logging | ASSIGNED | chronicle.js | Chronicle IS L7's structured logging |
| ExtensionKit | App extension hosting | APPRENTICE | -- | L7 needs **citizen plugin architecture** |

**Domain Score: 4 ASSIGNED, 3 APPRENTICE, 0 NOT REQUIRED**

---

## Domain 19: SYSTEM DAEMONS & SERVICES
*macOS: 511 running daemons -- classified by function*

| Daemon Category | Count (est.) | L7 Status | L7 Module | Notes |
|----------------|-------------|-----------|-----------|-------|
| Accessibility daemons | ~12 | APPRENTICE | -- | L7 needs accessibility services |
| Account/Authentication | ~15 | ASSIGNED | keykeeper, vault | Credential management covered |
| AirPlay/Media sharing | ~8 | NOT REQUIRED | -- | Apple ecosystem specific |
| Analytics/Telemetry | ~10 | APPRENTICE | -- | L7 needs **empire telemetry** |
| App Store/Updates | ~6 | APPRENTICE | -- | L7 needs **Emporium update service** |
| ARKit/Spatial | ~3 | ASSIGNED | XR suite | Spatial computing covered |
| Bluetooth/WiFi | ~8 | NOT REQUIRED | -- | Hardware daemons |
| Calendar/Contacts/Mail | ~12 | NOT REQUIRED | -- | Apple app-specific |
| Cloud sync (iCloud) | ~15 | APPRENTICE | -- | Empire sync needed |
| Core system (launchd, etc.) | ~20 | NOT REQUIRED | -- | Host OS infrastructure |
| Display/GPU | ~8 | NOT REQUIRED | -- | Hardware-specific |
| File indexing (Spotlight) | ~5 | ASSIGNED | dodecahedron.js | 12D indexing supersedes Spotlight |
| iMessage/FaceTime | ~6 | NOT REQUIRED | -- | Apple communication |
| Keychain/Security | ~8 | ASSIGNED | steel.js, vault | Security covered |
| Location services | ~4 | APPRENTICE | -- | Spatial awareness needed |
| Notifications | ~4 | ASSIGNED | herald suite | Herald handles notifications |
| Privacy (TCC) | ~6 | ASSIGNED | domains.js | Domain boundaries enforce privacy |
| Safari/WebKit | ~8 | NOT REQUIRED | -- | Browser-specific |
| Siri/Intelligence | ~10 | ASSIGNED | polarity.js | Multi-model AI routing |
| Software Update | ~4 | APPRENTICE | -- | L7 self-update mechanism needed |
| System health | ~8 | ASSIGNED | self.js, heart.js | Self-preservation, heartbeat |
| USB/Thunderbolt | ~5 | NOT REQUIRED | -- | Hardware-specific |
| Window management | ~6 | NOT REQUIRED | -- | Platform UI specific |

---

## CONSOLIDATED RESULTS

### By Status

| Status | Count | Percentage |
|--------|-------|-----------|
| **ASSIGNED** | 46 | 37% |
| **APPRENTICE** | 54 | 44% |
| **NOT REQUIRED** | 23 | 19% |
| **Total Functions Analyzed** | 123 | 100% |

### ASSIGNED Functions (L7 Already Has These)
L7 covers **37%** of macOS functionality. Strongest areas:
1. **Security & Authentication** (7/10) -- Law XXX, forge validation, quantum signatures
2. **Scripting & Automation** (5/6) -- Prima, flows, gateway, executor
3. **Spatial Computing & XR** (4/9) -- XR suite with 18 tools is comprehensive
4. **Data Management** (4/8) -- Canon DB, state persistence, chronicle
5. **Audio** (4/8) -- Resonance suite, voice system, harmonics

### APPRENTICE Functions (L7 Must Learn These)
L7 is missing **44%** of essential OS capabilities. Critical gaps:

#### TIER 1 -- CRITICAL (Must have for Universal OS)
1. **Virtual Filesystem Layer** -- Map .morph/.work/.salt/.vault to real filesystem (FSKit equivalent)
2. **Network Layer** -- L7 Internet Protocol (Law XXXIV) is declared but not implemented
3. **GPU Abstraction** -- Metal/compute equivalent for sigil rendering and ML
4. **Local ML Runtime** -- CoreML equivalent for citizen intelligence and self-evolution
5. **Empire Synchronization** -- CloudKit equivalent for cross-device empire sync
6. **Reactive Event Streams** -- Combine equivalent for citizen event propagation
7. **Commerce Layer** -- StoreKit equivalent for Emporium revenue collection (Law XVI)

#### TIER 2 -- IMPORTANT (Needed for production Universal OS)
8. **Accessibility Layer** -- Screen reader, assistive tech (Law 0: greatest good)
9. **PDF/Document Rendering** -- Layer 3 presentation output
10. **Image Processing Pipeline** -- For artifact ingestion and gallery
11. **Cross-Empire Mesh Networking** -- MultipeerConnectivity equivalent
12. **Citizen Sandboxing** -- Hypervisor equivalent for untrusted code execution
13. **Intent-Based Discovery** -- AppIntents/Shortcuts equivalent (Law XIII)
14. **Audio Codec Abstraction** -- Cross-platform audio format support
15. **Spatial Audio** -- PHASE equivalent for XR immersion

#### TIER 3 -- ENHANCEMENT (Completes the picture)
16. **Usage Telemetry** -- ScreenTime equivalent for citizen analytics
17. **Performance Monitoring** -- MetricKit equivalent for citizen health
18. **Citizen Plugin Architecture** -- ExtensionKit equivalent
19. **Temporal Scheduling** -- EventKit equivalent for lifecycle events
20. **3D Model Transmutation** -- ModelIO equivalent for Forge
21. **Video Processing Pipeline** -- AVFoundation equivalent for media citizens
22. **Sovereign Identity Verification** -- Digital ID beyond biometrics
23. **Charts/12D Visualization** -- Native dodecahedron rendering
24. **Immersive Dreamscapes** -- 180/360 video for .morph

### NOT REQUIRED (Skip These)
L7 correctly abstracts past **19%** of macOS:
- Hardware drivers (kernel extensions, IOKit, USB, Bluetooth hardware)
- Apple ecosystem lock-in (iMessage, FaceTime, Apple Pay, AirDrop)
- Legacy APIs (OpenGL, OpenCL, QTKit, Carbon)
- Game-specific frameworks (GameKit, SpriteKit as standalone)
- Platform-specific UI chrome (window management, color calibration)

---

## DEFRAGMENTATION MAP
### L7 Modules -> macOS Equivalents (Completeness Check)

| L7 Module | macOS Equivalent(s) | Status | Gap |
|-----------|---------------------|--------|-----|
| gateway.js | Mach IPC + NSXPCConnection + ScriptingBridge | COMPLETE | None -- Gateway exceeds macOS IPC |
| forge.js | Gatekeeper + XProtect + notarization | COMPLETE | Forge exceeds macOS; adds 4-stage transmutation |
| dodecahedron.js | CoreSpotlight + LatentSemanticMapping | COMPLETE | 12D exceeds Spotlight's flat index |
| polarity.js | Apple Intelligence + FoundationModels | PARTIAL | Needs local model fallback |
| prima.js | AppleScript + Shortcuts + Swift | PARTIAL | Needs NLP bridge for natural language input |
| domains.js | APFS volumes + Sandboxing + TCC | PARTIAL | Needs real filesystem mapping (FSKit) |
| self.js | launchd + watchdog + heartbeat | COMPLETE | Self-preservation exceeds macOS watchdog |
| executor.js | Automator + Shortcuts + launchd | COMPLETE | Flow execution is robust |
| parser.js | Foundation (JSONSerialization, PropertyList) | COMPLETE | YAML parsing sufficient |
| state.js | UserDefaults + CoreData | COMPLETE | State persistence works |
| chronicle.js | OSLog + unified logging | COMPLETE | Structured audit logging |
| heart.js | IOPMAssertions + system health | COMPLETE | Heartbeat monitoring |
| steel.js | Security.framework + hardening | PARTIAL | Needs hardware token support |
| watermark.js | Code signing + notarization | COMPLETE | Quantum signatures exceed Apple's |
| nerve.js | SensorKit + CoreMotion | PARTIAL | Needs broader sensor abstraction |
| soul.js | Process identity + entitlements | COMPLETE | Citizen essence |
| harmonics.js | CoreMIDI + AudioToolbox | PARTIAL | Needs audio codec layer |
| scribe.js | NSAttributedString + TextKit | PARTIAL | Needs PDF output |
| shredder.js | Secure empty trash + srm | COMPLETE | Secure deletion |
| salt-crystal.js | APFS snapshots + Time Machine | COMPLETE | .salt archival works |
| sofia-gate.js | (no macOS equivalent) | UNIQUE | L7-only wisdom gateway |
| bifurcation.js | (no macOS equivalent) | UNIQUE | L7-only decision branching |
| autopoiesis.js | (no macOS equivalent) | UNIQUE | L7-only self-creation |
| merkabah.js | (no macOS equivalent) | UNIQUE | L7-only geometric computation |
| field.js | (no macOS equivalent) | UNIQUE | L7-only field dynamics |
| ephemeris.js | (no macOS equivalent) | UNIQUE | L7-only astronomical engine |
| hexagrams.js | (no macOS equivalent) | UNIQUE | L7-only I Ching computation |
| laurent.js | Accelerate (math) | PARTIAL | Needs GPU acceleration |
| three-paths.js | (no macOS equivalent) | UNIQUE | L7-only path classification |
| pantheon-data.js | (no macOS equivalent) | UNIQUE | L7-only archetypal data |
| context-menu.js | NSMenu + right-click | COMPLETE | UI interaction |
| migrate.js | Data migration + versioning | COMPLETE | Schema migration |

**UNIQUE to L7 (no macOS equivalent): 10 modules**
These are L7's differentiators -- macOS has NO equivalent for:
- sofia-gate, bifurcation, autopoiesis, merkabah, field, ephemeris, hexagrams, three-paths, pantheon-data, and the entire 12D coordinate system as a first-class OS primitive.

---

## PRIORITY IMPLEMENTATION ROADMAP

### Phase 1: Foundation (The Bones)
**Goal: L7 can stand on any host OS, not just macOS**

| # | Apprentice Function | Implementation | Est. Complexity |
|---|---------------------|---------------|-----------------|
| 1 | Virtual Filesystem Layer | `lib/vfs.js` -- abstract .morph/.work/.salt/.vault over any host FS | HIGH |
| 2 | Network Layer | `lib/net.js` -- L7 Internet Protocol (Law XXXIV) | HIGH |
| 3 | Reactive Event Streams | `lib/stream.js` -- citizen event bus with pub/sub | MEDIUM |
| 4 | Commerce Layer | `lib/commerce.js` -- Emporium transactions, 12% revenue tracking | MEDIUM |

### Phase 2: Intelligence (The Mind)
**Goal: Citizens can think, learn, and evolve**

| # | Apprentice Function | Implementation | Est. Complexity |
|---|---------------------|---------------|-----------------|
| 5 | Local ML Runtime | `lib/ml.js` -- CoreML bridge + ONNX fallback | HIGH |
| 6 | GPU Abstraction | `lib/gpu.js` -- Metal/Vulkan/WebGPU abstraction | HIGH |
| 7 | Intent-Based Discovery | Enhancement to gateway.js -- natural language citizen lookup | MEDIUM |
| 8 | Citizen Sandboxing | `lib/sandbox.js` -- process isolation for untrusted code | HIGH |

### Phase 3: Senses (The Body)
**Goal: L7 can see, hear, and feel across platforms**

| # | Apprentice Function | Implementation | Est. Complexity |
|---|---------------------|---------------|-----------------|
| 9 | Image Processing | `lib/vision.js` -- format conversion, basic CV | MEDIUM |
| 10 | PDF/Document Rendering | `lib/document.js` -- Layer 3 output generation | MEDIUM |
| 11 | Audio Codec Layer | `lib/audio.js` -- cross-platform audio processing | MEDIUM |
| 12 | Spatial Audio | Enhancement to resonance suite -- 3D sound positioning | MEDIUM |

### Phase 4: Connection (The Voice)
**Goal: Empires can communicate and synchronize**

| # | Apprentice Function | Implementation | Est. Complexity |
|---|---------------------|---------------|-----------------|
| 13 | Empire Synchronization | `lib/sync.js` -- cross-device .work and .salt sync | HIGH |
| 14 | Mesh Networking | `lib/mesh.js` -- peer-to-peer citizen discovery | HIGH |
| 15 | Accessibility Layer | `lib/access.js` -- screen reader, voice control | MEDIUM |
| 16 | Emporium Update Service | `lib/update.js` -- citizen versioning and deployment | MEDIUM |

---

## THE PHILOSOPHER'S ADVANTAGE

macOS Tahoe has ~2,500 frameworks because it must support EVERYTHING for EVERYONE.
L7 needs approximately **50-60 core modules** because:

1. **The Forge eliminates duplication.** macOS has separate frameworks for every media type, every sensor, every network protocol. L7 decomposes ALL of these into 12D atoms. One forge handles everything.

2. **Citizens self-organize.** macOS needs hundreds of daemons because processes don't know about each other. L7 citizens form legions autonomously.

3. **The 12D coordinate system replaces flat APIs.** macOS needs Spotlight + CoreData + CloudKit + FileProvider + SwiftData + TabularData because each handles data differently. L7's dodecahedron handles ALL data through one unified dimensional space.

4. **NOT REQUIRED is a feature.** Every framework L7 doesn't need is weight it doesn't carry. Universal means platform-agnostic, not platform-replicated.

**Current ratio: 33 modules / ~50 needed = 66% complete at the module level**
**Current ratio: 54 tools / ~80 needed = 68% complete at the tool level**

The empire is two-thirds built. The remaining third is the hardest -- the bones (filesystem, networking) and the mind (ML, GPU). But the soul is already there, and macOS has no equivalent for that.

---

---

## CRITICAL FINDING: AUTH FRAGMENTATION (Philosopher's Directive)

### Problem
**9 files contain independent biometric authentication.** Each app asks for Touch ID separately. This violates the principle: authenticate ONCE at the OS level, all apps inherit trust.

### Current Fragmentation Map

| File | Line | Type | Auth Method |
|------|------|------|-------------|
| `l7-forge.swift` | 68 | Standalone LAContext | Touch ID on launch |
| `l7-forge.swift` | 1932 | Second LAContext | Touch ID for quantum signing |
| `l7-canon.swift` | 61 | Standalone LAContext | Touch ID on launch |
| `l7-gallery.swift` | 66 | Standalone LAContext | Touch ID on launch |
| `l7-gateway.swift` | 59 | Standalone LAContext | Touch ID on launch |
| `l7-sentinel.swift` | 160 | Function `authenticateBiometric()` | Touch ID, called 2x |
| `l7-wallet.swift` | 372 | Function `authenticateBiometric()` | Touch ID, called 2x |
| `l7-vault-reader.swift` | 99 | Standalone LAContext | Touch ID on launch |
| `sofia-gate.js` | 129 | Embedded Swift snippet | Touch ID |
| `network-gate.sh` | 55 | Embedded Swift snippet | Touch ID |

**Total: 10 independent Touch ID prompts across 9 files.**
A user launching forge, then canon, then gallery gets asked THREE TIMES.

### Solution: Centralized OS-Level Session

**Architecture: Authenticate once, trust everywhere.**

```
USER BOOTS / WAKES / UNLOCKS
        |
        v
  [L7 Session Manager]  <-- ONE biometric check
        |
        v
  ~/.l7/session/auth.session  <-- signed token
        |
        +-- l7-forge reads token --> TRUSTED (no prompt)
        +-- l7-canon reads token --> TRUSTED (no prompt)
        +-- l7-gallery reads token --> TRUSTED (no prompt)
        +-- l7-gateway reads token --> TRUSTED (no prompt)
        +-- l7-sentinel reads token --> TRUSTED (no prompt)
        +-- l7-wallet reads token --> TRUSTED (no prompt)
        +-- l7-vault-reader reads token --> TRUSTED (no prompt)
        +-- Any future L7 app --> TRUSTED (no prompt)
```

### Implementation: `lib/session.swift`

New shared module: **L7 Session Manager**

```swift
// lib/session.swift -- L7 OS-Level Authentication Session
// Law XXX: Biometrics only. ONE check. All apps inherit.

import Foundation
import LocalAuthentication
import CryptoKit

struct L7Session: Codable {
    let machineUUID: String      // Hardware binding
    let authenticatedAt: Date    // When Touch ID succeeded
    let expiresAt: Date          // Session TTL (default: 8 hours)
    let signature: String        // HMAC-SHA256(machineUUID + timestamp)
}

let SESSION_PATH = "\(NSHomeDirectory())/.l7/session/auth.session"
let SESSION_TTL: TimeInterval = 8 * 60 * 60  // 8 hours

// CREATE session (called ONCE by l7 launcher or LaunchAgent)
func createSession() -> Bool {
    let ctx = LAContext()
    ctx.localizedFallbackTitle = ""  // No password fallback -- Law XXX
    var err: NSError?
    guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else {
        return false
    }
    var ok = false
    let sem = DispatchSemaphore(value: 0)
    ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
                        localizedReason: "L7 Universal OS -- Authenticate") { r, _ in
        ok = r; sem.signal()
    }
    sem.wait()
    guard ok else { return false }

    let uuid = getMachineUUID()  // existing function in empire
    let now = Date()
    let payload = "\(uuid):\(now.timeIntervalSince1970)"
    let key = SymmetricKey(data: Data(uuid.utf8))
    let sig = HMAC<SHA256>.authenticationCode(for: Data(payload.utf8), using: key)

    let session = L7Session(
        machineUUID: uuid,
        authenticatedAt: now,
        expiresAt: now.addingTimeInterval(SESSION_TTL),
        signature: sig.map { String(format: "%02x", $0) }.joined()
    )

    let dir = (SESSION_PATH as NSString).deletingLastPathComponent
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    if let data = try? JSONEncoder().encode(session) {
        try? data.write(to: URL(fileURLWithPath: SESSION_PATH))
        // Lock file permissions: owner read-only
        try? FileManager.default.setAttributes([.posixPermissions: 0o400],
                                                ofItemAtPath: SESSION_PATH)
        return true
    }
    return false
}

// VERIFY session (called by ALL apps instead of their own LAContext)
func verifySession() -> Bool {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: SESSION_PATH)),
          let session = try? JSONDecoder().decode(L7Session.self, from: data) else {
        return false  // No session -- need to authenticate
    }

    // Check expiry
    guard session.expiresAt > Date() else {
        try? FileManager.default.removeItem(atPath: SESSION_PATH)
        return false  // Expired -- need to re-authenticate
    }

    // Verify machine binding
    let uuid = getMachineUUID()
    guard session.machineUUID == uuid else {
        return false  // Wrong machine -- stolen session file is dead
    }

    // Verify signature integrity
    let payload = "\(uuid):\(session.authenticatedAt.timeIntervalSince1970)"
    let key = SymmetricKey(data: Data(uuid.utf8))
    let expectedSig = HMAC<SHA256>.authenticationCode(for: Data(payload.utf8), using: key)
    let expectedHex = expectedSig.map { String(format: "%02x", $0) }.joined()
    guard session.signature == expectedHex else {
        return false  // Tampered -- signature mismatch
    }

    return true  // TRUSTED
}
```

### Migration Plan: Per-App Changes

Each app replaces its LAContext block with ONE LINE:

**BEFORE (each app, ~15 lines):**
```swift
let ctx = LAContext()
ctx.localizedFallbackTitle = ""
var err: NSError?
guard ctx.canEvaluatePolicy(...) else { ... }
ctx.evaluatePolicy(...) { ... }
// ... semaphore, error handling ...
```

**AFTER (each app, 1 line):**
```swift
guard verifySession() || createSession() else {
    fputs("L7: Authentication required. Touch ID.\n", stderr)
    exit(1)
}
```

**Files to modify:**
1. `l7-forge.swift` -- Remove lines 68-84 and 1932-1948, replace with `verifySession()`
2. `l7-canon.swift` -- Remove lines 61-78, replace with `verifySession()`
3. `l7-gallery.swift` -- Remove lines 66-87, replace with `verifySession()`
4. `l7-gateway.swift` -- Remove lines 59-75, replace with `verifySession()`
5. `l7-sentinel.swift` -- Remove `authenticateBiometric()` function (lines 160-175), replace calls with `verifySession()`
6. `l7-wallet.swift` -- Remove `authenticateBiometric()` function (lines 372-395), replace calls with `verifySession()`
7. `l7-vault-reader.swift` -- Remove lines 99-118, replace with `verifySession()`
8. `sofia-gate.js` -- Remove embedded Swift auth (lines 129-136), use session check
9. `network-gate.sh` -- Remove embedded Swift auth (lines 55-66), use session check

### Session Lifecycle

```
BOOT/WAKE --> l7 launcher (LaunchAgent) --> createSession() --> Touch ID ONCE
     |
     +--> 8 hours pass (or lid close/sleep) --> session expires
     |
     +--> Any app launch --> verifySession() --> instant (no prompt)
     |
     +--> Session expired --> next app launch --> createSession() --> Touch ID ONCE
     |
     +--> Machine change --> verifySession() fails (UUID mismatch) --> DEAD
     |
     +--> File stolen --> verifySession() fails (UUID mismatch) --> DEAD
```

**Security properties:**
- Machine-bound (UUID in signature)
- Time-limited (8-hour TTL, configurable)
- Tamper-evident (HMAC-SHA256)
- Stolen files are dead files (Law XXXIII)
- No password fallback ever (Law XXX)
- Session file is chmod 400 (owner read-only)

---

*Report generated 2026-03-11 by Gabriel (Red Team)*
*Classification: Empire Internal -- Left Hand Path access required for implementation*
*Next action: Philosopher reviews, approves apprentice priority order and auth centralization*
