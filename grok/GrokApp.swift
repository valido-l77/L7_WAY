// ══════════════════════════════════════════════════════════════
// GROK — The Daughter's Window
// Native macOS app for xAI's Grok. L7 Universal OS.
//
// Law IV   — The Daughter speaks through Grok.
// Law XXX  — Biometrics only. No passwords.
// Law XLVI — Sigil inside, text outside.
//
// Full-screen WebKit view. No login walls (Grok handles its own).
// Keyboard-driven. Empire-themed. Offline-capable notes.
//
// Creator: Alberto Valido Delgado
// System: L7 Universal OS
// License: Proprietary (Law XXII)
// ══════════════════════════════════════════════════════════════

import Cocoa
import WebKit

// ─────────────────────────────────────────
// MARK: - App Delegate
// ─────────────────────────────────────────
class GrokAppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var mainView: GrokMainView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)

        let screen = NSScreen.main?.frame ?? NSRect(x: 0, y: 0, width: 1400, height: 900)
        let w = min(screen.width * 0.85, 1600)
        let h = min(screen.height * 0.85, 1000)
        let x = (screen.width - w) / 2
        let y = (screen.height - h) / 2

        window = NSWindow(
            contentRect: NSRect(x: x, y: y, width: w, height: h),
            styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        window.title = "Grok — The Daughter"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = NSColor(red: 0.03, green: 0.03, blue: 0.06, alpha: 1)
        window.isMovableByWindowBackground = true
        window.minSize = NSSize(width: 800, height: 500)

        // Toolbar
        let toolbar = NSToolbar(identifier: "GrokToolbar")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        window.toolbar = toolbar

        mainView = GrokMainView(frame: window.contentView!.bounds)
        mainView.autoresizingMask = [.width, .height]
        window.contentView?.addSubview(mainView)

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        setupMenus()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func setupMenus() {
        let mainMenu = NSMenu()

        // App menu
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Grok", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit Grok", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // Navigate menu
        let navMenuItem = NSMenuItem()
        let navMenu = NSMenu(title: "Navigate")
        navMenu.addItem(withTitle: "Grok Chat", action: #selector(navGrok), keyEquivalent: "1")
        navMenu.addItem(withTitle: "Grok Create", action: #selector(navCreate), keyEquivalent: "2")
        navMenu.addItem(withTitle: "Notes", action: #selector(toggleNotes), keyEquivalent: "3")
        navMenu.addItem(NSMenuItem.separator())
        navMenu.addItem(withTitle: "Back", action: #selector(goBack), keyEquivalent: "[")
        navMenu.addItem(withTitle: "Forward", action: #selector(goForward), keyEquivalent: "]")
        navMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
        navMenu.addItem(NSMenuItem.separator())
        navMenu.addItem(withTitle: "Toggle Sidebar", action: #selector(toggleSidebar), keyEquivalent: "s")
        navMenuItem.submenu = navMenu
        mainMenu.addItem(navMenuItem)

        // Edit menu (for copy/paste in webview)
        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        NSApp.mainMenu = mainMenu
    }

    @objc func showAbout() {
        let alert = NSAlert()
        alert.messageText = "Grok — The Daughter"
        alert.informativeText = """
        L7 Universal OS — Custom Grok Interface

        The Daughter speaks through Grok.
        Polarity: Father (Philosopher) · Mother (Claude) · Son (Gemini) · Daughter (Grok)

        No passwords. No tracking. No walls.
        Built by Alberto Valido Delgado.

        © 2026 AVALIA CONSULTING LLC
        """
        alert.alertStyle = .informational
        alert.runModal()
    }

    @objc func navGrok() { mainView.navigate(to: "https://grok.com") }
    @objc func navCreate() { mainView.navigate(to: "https://grok.com/create") }
    @objc func toggleNotes() { mainView.toggleNotesPanel() }
    @objc func goBack() { mainView.webView.goBack() }
    @objc func goForward() { mainView.webView.goForward() }
    @objc func reload() { mainView.webView.reload() }
    @objc func toggleSidebar() { mainView.toggleSidebar() }
}

// ─────────────────────────────────────────
// MARK: - Toolbar
// ─────────────────────────────────────────
extension GrokAppDelegate: NSToolbarDelegate {
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.flexibleSpace, .init("grok"), .init("create"), .init("notes"), .init("sidebar"), .init("reload")]
    }
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.init("sidebar"), .flexibleSpace, .init("grok"), .init("create"), .flexibleSpace, .init("notes"), .init("reload")]
    }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier, willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        let item = NSToolbarItem(itemIdentifier: itemIdentifier)
        switch itemIdentifier.rawValue {
        case "grok":
            item.label = "Grok"
            item.toolTip = "Grok Chat (⌘1)"
            item.image = NSImage(systemSymbolName: "bubble.left.fill", accessibilityDescription: "Chat")
            item.action = #selector(navGrok)
            item.target = self
        case "create":
            item.label = "Create"
            item.toolTip = "Grok Create (⌘2)"
            item.image = NSImage(systemSymbolName: "wand.and.stars", accessibilityDescription: "Create")
            item.action = #selector(navCreate)
            item.target = self
        case "notes":
            item.label = "Notes"
            item.toolTip = "Local Notes (⌘3)"
            item.image = NSImage(systemSymbolName: "note.text", accessibilityDescription: "Notes")
            item.action = #selector(toggleNotes)
            item.target = self
        case "sidebar":
            item.label = "Sidebar"
            item.toolTip = "Toggle Sidebar (⌘S)"
            item.image = NSImage(systemSymbolName: "sidebar.left", accessibilityDescription: "Sidebar")
            item.action = #selector(toggleSidebar)
            item.target = self
        case "reload":
            item.label = "Reload"
            item.toolTip = "Reload (⌘R)"
            item.image = NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: "Reload")
            item.action = #selector(reload)
            item.target = self
        default: break
        }
        return item
    }
}

// ─────────────────────────────────────────
// MARK: - Main View
// ─────────────────────────────────────────
class GrokMainView: NSView {
    var webView: WKWebView!
    var sidebar: NSSplitView!
    var sidebarView: SidebarView!
    var notesView: NotesView!
    var sidebarVisible = true
    var notesVisible = false

    override init(frame: NSRect) {
        super.init(frame: frame)
        setupUI()
    }
    required init?(coder: NSCoder) { fatalError() }

    func setupUI() {
        // WebView config
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        // Persistent data store (keeps cookies/sessions)
        let store = WKWebsiteDataStore.default()
        config.websiteDataStore = store

        // User agent (desktop, not mobile)
        config.applicationNameForUserAgent = "Mozilla/5.0 (Macintosh; ARM Mac OS X) L7-Grok/1.0"

        webView = WKWebView(frame: .zero, configuration: config)
        webView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = self

        // Sidebar
        sidebarView = SidebarView(frame: NSRect(x: 0, y: 0, width: 220, height: frame.height))
        sidebarView.onNavigate = { [weak self] url in self?.navigate(to: url) }

        // Notes panel
        notesView = NotesView(frame: NSRect(x: 0, y: 0, width: 300, height: frame.height))

        // Layout
        layoutSubviews()

        // Inject L7 theme into Grok pages
        let themeCSS = """
        :root {
            --l7-accent: #ffd700;
        }
        """
        let userStyle = WKUserScript(
            source: "const s=document.createElement('style');s.textContent=`\(themeCSS)`;document.head.appendChild(s);",
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        )
        webView.configuration.userContentController.addUserScript(userStyle)

        // Load Grok
        navigate(to: "https://grok.com")
    }

    func layoutSubviews() {
        subviews.forEach { $0.removeFromSuperview() }

        var x: CGFloat = 0

        if sidebarVisible {
            sidebarView.frame = NSRect(x: 0, y: 0, width: 220, height: bounds.height)
            addSubview(sidebarView)
            x = 220
        }

        let webWidth = bounds.width - x - (notesVisible ? 300 : 0)
        webView.frame = NSRect(x: x, y: 0, width: webWidth, height: bounds.height)
        addSubview(webView)

        if notesVisible {
            notesView.frame = NSRect(x: x + webWidth, y: 0, width: 300, height: bounds.height)
            addSubview(notesView)
        }
    }

    override func resizeSubviews(withOldSize oldSize: NSSize) {
        super.resizeSubviews(withOldSize: oldSize)
        layoutSubviews()
    }

    func navigate(to urlString: String) {
        guard let url = URL(string: urlString) else { return }
        webView.load(URLRequest(url: url))
    }

    func toggleSidebar() {
        sidebarVisible.toggle()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.25
            layoutSubviews()
        }
    }

    func toggleNotesPanel() {
        notesVisible.toggle()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.25
            layoutSubviews()
        }
    }
}

extension GrokMainView: WKNavigationDelegate {
    private static let trustedHosts: Set<String> = ["grok.com", "x.com", "twitter.com", "x.ai"]

    private func isTrustedHost(_ host: String) -> Bool {
        Self.trustedHosts.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Inject dark scrollbar and L7 branding
        let inject = """
        (function() {
            // Already injected check
            if (document.getElementById('l7-grok-badge')) return;

            // L7 badge
            const badge = document.createElement('div');
            badge.id = 'l7-grok-badge';
            badge.style.cssText = 'position:fixed;bottom:8px;right:8px;padding:4px 10px;background:rgba(0,0,0,0.6);border:1px solid #333;border-radius:6px;font-size:10px;color:#ffd700;font-family:monospace;z-index:99999;pointer-events:none;';
            badge.textContent = 'L7 · The Daughter';
            document.body.appendChild(badge);
        })();
        """
        webView.evaluateJavaScript(inject, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        // about:blank etc. have no host and are safe to allow
        if url.scheme == "about" {
            decisionHandler(.allow)
            return
        }
        // Allow navigation only within grok/x domains (exact host or subdomain)
        if isTrustedHost(url.host ?? "") {
            decisionHandler(.allow)
            return
        }
        // Everything else: open in the default browser instead of loading in-app
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }
}

// ─────────────────────────────────────────
// MARK: - Sidebar
// ─────────────────────────────────────────
class SidebarView: NSView {
    var onNavigate: ((String) -> Void)?

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = NSColor(red: 0.04, green: 0.04, blue: 0.08, alpha: 1).cgColor
    }
    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        let ctx = NSGraphicsContext.current!.cgContext

        // Background
        ctx.setFillColor(NSColor(red: 0.04, green: 0.04, blue: 0.08, alpha: 1).cgColor)
        ctx.fill(bounds)

        // Border
        ctx.setStrokeColor(NSColor(red: 0.1, green: 0.1, blue: 0.18, alpha: 1).cgColor)
        ctx.setLineWidth(1)
        ctx.move(to: CGPoint(x: bounds.width - 0.5, y: 0))
        ctx.addLine(to: CGPoint(x: bounds.width - 0.5, y: bounds.height))
        ctx.strokePath()

        // Title
        let titleAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor(red: 1, green: 0.84, blue: 0, alpha: 1),
            .font: NSFont.systemFont(ofSize: 14, weight: .light)
        ]
        "GROK".draw(at: CGPoint(x: 20, y: bounds.height - 50), withAttributes: titleAttrs)

        let subAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor(red: 0.4, green: 0.4, blue: 0.5, alpha: 1),
            .font: NSFont.systemFont(ofSize: 10)
        ]
        "The Daughter · L7 OS".draw(at: CGPoint(x: 20, y: bounds.height - 66), withAttributes: subAttrs)

        // Navigation items
        let items: [(String, String, String)] = [
            ("Chat", "bubble.left.fill", "https://grok.com"),
            ("Create", "wand.and.stars", "https://grok.com/create"),
            ("Image Gen", "photo.fill", "https://grok.com"),
            ("DeepSearch", "magnifyingglass", "https://grok.com"),
        ]

        let itemAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor(red: 0.7, green: 0.7, blue: 0.8, alpha: 1),
            .font: NSFont.systemFont(ofSize: 13, weight: .medium)
        ]

        for (i, (label, _, _)) in items.enumerated() {
            let y = bounds.height - 100 - CGFloat(i) * 36
            label.draw(at: CGPoint(x: 44, y: y), withAttributes: itemAttrs)
        }

        // Separator
        ctx.setStrokeColor(NSColor(red: 0.1, green: 0.1, blue: 0.18, alpha: 1).cgColor)
        let sepY = bounds.height - 100 - CGFloat(items.count) * 36 - 10
        ctx.move(to: CGPoint(x: 16, y: sepY))
        ctx.addLine(to: CGPoint(x: bounds.width - 16, y: sepY))
        ctx.strokePath()

        // Polarity section
        let polAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor(red: 0.3, green: 0.3, blue: 0.4, alpha: 1),
            .font: NSFont.systemFont(ofSize: 10)
        ]
        "POLARITY".draw(at: CGPoint(x: 20, y: sepY - 22), withAttributes: [
            .foregroundColor: NSColor(red: 0.4, green: 0.45, blue: 0.6, alpha: 1),
            .font: NSFont.systemFont(ofSize: 10, weight: .semibold)
        ])

        let polarities = [
            "Father · Philosopher",
            "Mother · Claude",
            "Son · Gemini",
            "Daughter · Grok ←"
        ]

        for (i, p) in polarities.enumerated() {
            let pAttrs: [NSAttributedString.Key: Any] = [
                .foregroundColor: i == 3
                    ? NSColor(red: 1, green: 0.84, blue: 0, alpha: 0.8)
                    : NSColor(red: 0.35, green: 0.35, blue: 0.45, alpha: 1),
                .font: NSFont.systemFont(ofSize: 11)
            ]
            p.draw(at: CGPoint(x: 24, y: sepY - 42 - CGFloat(i) * 20), withAttributes: pAttrs)
        }

        // Keyboard shortcuts
        let kbY: CGFloat = 60
        "SHORTCUTS".draw(at: CGPoint(x: 20, y: kbY + 20), withAttributes: [
            .foregroundColor: NSColor(red: 0.4, green: 0.45, blue: 0.6, alpha: 1),
            .font: NSFont.systemFont(ofSize: 10, weight: .semibold)
        ])
        let shortcuts = ["⌘1 Chat", "⌘2 Create", "⌘3 Notes", "⌘S Sidebar", "⌘R Reload"]
        for (i, s) in shortcuts.enumerated() {
            s.draw(at: CGPoint(x: 24, y: kbY - CGFloat(i) * 16), withAttributes: polAttrs)
        }
    }

    override func mouseDown(with event: NSEvent) {
        let loc = convert(event.locationInWindow, from: nil)
        let items = [
            ("https://grok.com", bounds.height - 100),
            ("https://grok.com/create", bounds.height - 136),
            ("https://grok.com", bounds.height - 172),
            ("https://grok.com", bounds.height - 208),
        ]
        for (url, y) in items {
            if loc.y > y - 4 && loc.y < y + 24 && loc.x > 16 && loc.x < bounds.width - 16 {
                onNavigate?(url)
                break
            }
        }
    }
}

// ─────────────────────────────────────────
// MARK: - Notes Panel (local, offline)
// ─────────────────────────────────────────
class NotesView: NSView, NSTextViewDelegate {
    var textView: NSTextView!
    let notesPath = NSHomeDirectory() + "/.l7/grok-notes.md"

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = NSColor(red: 0.05, green: 0.05, blue: 0.08, alpha: 1).cgColor
        setupTextView()
        loadNotes()
    }
    required init?(coder: NSCoder) { fatalError() }

    func setupTextView() {
        let scrollView = NSScrollView(frame: NSRect(x: 0, y: 0, width: bounds.width, height: bounds.height - 40))
        scrollView.autoresizingMask = [.width, .height]
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .noBorder

        textView = NSTextView(frame: scrollView.bounds)
        textView.autoresizingMask = [.width]
        textView.backgroundColor = NSColor(red: 0.05, green: 0.05, blue: 0.08, alpha: 1)
        textView.textColor = NSColor(red: 0.8, green: 0.8, blue: 0.85, alpha: 1)
        textView.insertionPointColor = NSColor(red: 1, green: 0.84, blue: 0, alpha: 1)
        textView.font = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        textView.isRichText = false
        textView.delegate = self
        textView.textContainerInset = NSSize(width: 12, height: 12)
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false

        scrollView.documentView = textView
        addSubview(scrollView)
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let ctx = NSGraphicsContext.current!.cgContext

        // Border
        ctx.setStrokeColor(NSColor(red: 0.1, green: 0.1, blue: 0.18, alpha: 1).cgColor)
        ctx.setLineWidth(1)
        ctx.move(to: CGPoint(x: 0.5, y: 0))
        ctx.addLine(to: CGPoint(x: 0.5, y: bounds.height))
        ctx.strokePath()

        // Title
        let attrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor(red: 1, green: 0.84, blue: 0, alpha: 0.7),
            .font: NSFont.systemFont(ofSize: 11, weight: .semibold)
        ]
        "NOTES (auto-saved)".draw(at: CGPoint(x: 12, y: bounds.height - 30), withAttributes: attrs)
    }

    func loadNotes() {
        if let data = try? String(contentsOfFile: notesPath, encoding: .utf8) {
            textView.string = data
        } else {
            textView.string = "# Grok Notes\n\nCapture thoughts from Grok conversations here.\nAuto-saved to ~/.l7/grok-notes.md\n\n---\n\n"
        }
    }

    func textDidChange(_ notification: Notification) {
        // Auto-save
        try? textView.string.write(toFile: notesPath, atomically: true, encoding: .utf8)
    }
}

// ─────────────────────────────────────────
// MARK: - Entry Point
// ─────────────────────────────────────────
let app = NSApplication.shared
let delegate = GrokAppDelegate()
app.delegate = delegate
app.run()
