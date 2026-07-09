#!/bin/bash
# Build Grok — The Daughter's Window
# Native macOS app, no dependencies

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Grok"
APP_BUNDLE="$DIR/$APP_NAME.app"
BINARY="$APP_BUNDLE/Contents/MacOS/$APP_NAME"
L7_DIR="$HOME/.l7"

echo "Building $APP_NAME..."

# Clean previous build
rm -rf "$APP_BUNDLE"

# Create app bundle structure
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# Compile
swiftc "$DIR/GrokApp.swift" \
    -o "$BINARY" \
    -framework Cocoa \
    -framework WebKit \
    -target arm64-apple-macosx14.0 \
    -O \
    -swift-version 5

echo "Compiled: $(wc -c < "$BINARY" | tr -d ' ') bytes"

# Info.plist
cat > "$APP_BUNDLE/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>Grok</string>
    <key>CFBundleDisplayName</key>
    <string>Grok — The Daughter</string>
    <key>CFBundleIdentifier</key>
    <string>cloud.avli.l7.grok</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleExecutable</key>
    <string>Grok</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSHumanReadableCopyright</key>
    <string>© 2026 Alberto Valido Delgado — AVALIA CONSULTING LLC</string>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.productivity</string>
</dict>
</plist>
PLIST

# Ensure notes directory exists
mkdir -p "$L7_DIR"

# Launcher script
cat > "$DIR/grok" << 'LAUNCHER'
#!/bin/bash
open "$(dirname "$0")/Grok.app"
LAUNCHER
chmod +x "$DIR/grok"

echo ""
echo "=== BUILT ==="
echo "App:      $APP_BUNDLE"
echo "Binary:   $(du -h "$BINARY" | cut -f1) arm64"
echo "Bundle:   cloud.avli.l7.grok"
echo "Launcher: $DIR/grok"
echo ""
echo "Run:  open $APP_BUNDLE"
echo "  or: $DIR/grok"
