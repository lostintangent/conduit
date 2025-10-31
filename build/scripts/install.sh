#!/bin/bash

# Conduit Installation Script
# Supports macOS and Linux
# Downloads and installs the latest release from GitHub

set -e

REPO="lostintangent/conduit"
APP_NAME="Conduit"

echo "🚀 Starting Conduit installation..."
echo ""

# Detect OS and architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "${OS}" in
    Darwin*)
        PLATFORM="darwin"
        INSTALL_DIR="/Applications"
        ;;
    Linux*)
        PLATFORM="linux"
        INSTALL_DIR="/opt"
        ;;
    *)
        echo "❌ Error: Unsupported operating system: ${OS}"
        echo "This script supports macOS and Linux only."
        echo "For Windows, please use the PowerShell installation script."
        exit 1
        ;;
esac

case "${ARCH}" in
    x86_64)
        ARCH="x64"
        ;;
    arm64|aarch64)
        ARCH="arm64"
        ;;
    *)
        echo "❌ Error: Unsupported architecture: ${ARCH}"
        exit 1
        ;;
esac

echo "📋 Detected platform: ${PLATFORM}-${ARCH}"
echo ""

# Get latest release information
echo "🔍 Fetching latest release information..."
RELEASE_INFO=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest")
RELEASE_TAG=$(echo "${RELEASE_INFO}" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "${RELEASE_TAG}" ]; then
    echo "❌ Error: Could not fetch latest release information"
    echo "Please check your internet connection and try again."
    exit 1
fi

echo "✅ Found latest release: ${RELEASE_TAG}"
echo ""

# Determine download URL based on platform
if [ "${PLATFORM}" = "darwin" ]; then
    # macOS: Download ZIP file
    DOWNLOAD_URL=$(echo "${RELEASE_INFO}" | grep "browser_download_url.*${PLATFORM}.*\.zip" | head -n 1 | cut -d '"' -f 4)
    FILE_EXT="zip"
elif [ "${PLATFORM}" = "linux" ]; then
    # Linux: Download DEB or RPM based on distribution
    if command -v apt-get &> /dev/null; then
        DOWNLOAD_URL=$(echo "${RELEASE_INFO}" | grep "browser_download_url.*\.deb" | head -n 1 | cut -d '"' -f 4)
        FILE_EXT="deb"
    elif command -v yum &> /dev/null || command -v dnf &> /dev/null; then
        DOWNLOAD_URL=$(echo "${RELEASE_INFO}" | grep "browser_download_url.*\.rpm" | head -n 1 | cut -d '"' -f 4)
        FILE_EXT="rpm"
    else
        echo "❌ Error: Unsupported Linux distribution"
        echo "This script supports Debian/Ubuntu (apt) and RHEL/Fedora (yum/dnf) based distributions."
        exit 1
    fi
fi

if [ -z "${DOWNLOAD_URL}" ]; then
    echo "❌ Error: Could not find download URL for ${PLATFORM}-${ARCH}"
    echo "Please check the releases page manually: https://github.com/${REPO}/releases"
    exit 1
fi

echo "📥 Downloading from: ${DOWNLOAD_URL}"
echo ""

# Create temporary directory
TMP_DIR=$(mktemp -d)
trap "rm -rf ${TMP_DIR}" EXIT

# Download the release
DOWNLOAD_FILE="${TMP_DIR}/conduit.${FILE_EXT}"
if ! curl -L -o "${DOWNLOAD_FILE}" "${DOWNLOAD_URL}"; then
    echo "❌ Error: Download failed"
    exit 1
fi

echo "✅ Download complete"
echo ""

# Install based on platform
if [ "${PLATFORM}" = "darwin" ]; then
    echo "📦 Extracting application..."
    unzip -q "${DOWNLOAD_FILE}" -d "${TMP_DIR}"
    
    # Find the .app bundle
    APP_BUNDLE=$(find "${TMP_DIR}" -name "*.app" -type d | head -n 1)
    
    if [ -z "${APP_BUNDLE}" ]; then
        echo "❌ Error: Could not find .app bundle in downloaded archive"
        exit 1
    fi
    
    INSTALL_PATH="${INSTALL_DIR}/${APP_NAME}.app"
    
    echo "📱 Installing to ${INSTALL_PATH}..."
    
    # Remove old version if it exists
    if [ -d "${INSTALL_PATH}" ]; then
        echo "🗑️  Removing old version..."
        rm -rf "${INSTALL_PATH}"
    fi
    
    # Copy the new version
    cp -R "${APP_BUNDLE}" "${INSTALL_PATH}"
    
    # Verify installation
    if [ -d "${INSTALL_PATH}" ]; then
        echo ""
        echo "✅ Installation complete!"
        echo "🎉 Conduit has been installed to ${INSTALL_PATH}"
        echo ""
        echo "You can now launch Conduit from your Applications folder or Spotlight."
    else
        echo "❌ Error: Installation failed"
        exit 1
    fi
    
elif [ "${PLATFORM}" = "linux" ]; then
    echo "📦 Installing package..."
    
    if [ "${FILE_EXT}" = "deb" ]; then
        sudo dpkg -i "${DOWNLOAD_FILE}" || sudo apt-get install -f -y
    elif [ "${FILE_EXT}" = "rpm" ]; then
        if command -v dnf &> /dev/null; then
            sudo dnf install -y "${DOWNLOAD_FILE}"
        else
            sudo yum install -y "${DOWNLOAD_FILE}"
        fi
    fi
    
    echo ""
    echo "✅ Installation complete!"
    echo "🎉 Conduit has been installed"
    echo ""
    echo "You can now launch Conduit from your applications menu or by running 'conduit' in your terminal."
fi

echo ""
echo "📚 For more information, visit: https://github.com/${REPO}"
